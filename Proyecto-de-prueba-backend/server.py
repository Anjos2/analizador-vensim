# ====================================================================
# || GUÍA DE INSTALACIÓN DEL BACKEND (Python)                       ||
# ====================================================================
# || 1. Detén el servidor (Ctrl+C) si está corriendo.               ||
# || 2. Reemplaza el código en `server.py` con este.                ||
# || 3. Asegúrate de que exista la carpeta `uploaded_models`.       ||
# || 4. Ejecuta el servidor de nuevo: `python server.py`            ||
# ====================================================================

import os
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import pysd
import pandas as pd

app = Flask(__name__)
CORS(app)

MODEL_STORAGE_PATH = "uploaded_models"
if not os.path.exists(MODEL_STORAGE_PATH):
    os.makedirs(MODEL_STORAGE_PATH)

def clean_filename(filename):
    """Crea un nombre de archivo seguro a partir del nombre del escenario."""
    s = str(filename).strip().replace(' ', '_')
    s = re.sub(r'(?u)[^-\w.]', '', s)
    return s

def clean_column_names(df):
    """Limpia los nombres de las columnas para compatibilidad con JSON/JS."""
    new_columns = {}
    for col in df.columns:
        clean_col = re.sub(r'["\']', '', col).replace(' ', '_')
        if str(col).upper() == 'TIME':
            new_columns[col] = 'TIME'
        else:
            new_columns[col] = clean_col
    df.rename(columns=new_columns, inplace=True)
    return df

@app.route('/simulate', methods=['POST'])
def simulate_model():
    """Recibe un archivo .mdl, lo guarda permanentemente y lo simula."""
    if 'file' not in request.files or 'scenarioName' not in request.form:
        return jsonify({"error": "Petición incompleta"}), 400
    
    file = request.files['file']
    scenario_name = request.form.get('scenarioName')

    if not file or not file.filename.endswith('.mdl'):
        return jsonify({"error": "Archivo no válido"}), 400

    safe_filename = clean_filename(scenario_name) + ".mdl"
    file_path = os.path.join(MODEL_STORAGE_PATH, safe_filename)
    
    try:
        file.save(file_path)
        model = pysd.read_vensim(file_path)
        results_df = model.run()
        results_df = results_df.reset_index()
        results_df = clean_column_names(results_df)
        return jsonify(results_df.to_json(orient='records'))
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"error": f"Error al procesar modelo: {e}"}), 500

@app.route('/resimulate', methods=['POST'])
def resimulate_model():
    """Re-simula un modelo ya guardado en disco con una lógica de búsqueda de variables mejorada."""
    data = request.get_json()
    base_scenario_name = data.get('base_scenario_name')
    var_to_modify_clean = data.get('variable_to_modify')
    new_value_str = data.get('new_value')
    start_time_str = data.get('start_time')

    if not all([base_scenario_name, var_to_modify_clean, new_value_str, start_time_str]):
        return jsonify({"error": "Faltan parámetros"}), 400

    safe_filename = clean_filename(base_scenario_name) + ".mdl"
    file_path = os.path.join(MODEL_STORAGE_PATH, safe_filename)

    if not os.path.exists(file_path):
        return jsonify({"error": f"No se encontró el archivo del modelo base '{base_scenario_name}'. Por favor, cárgalo de nuevo."}), 404

    try:
        new_value = float(new_value_str)
        start_time = float(start_time_str)
        
        model = pysd.read_vensim(file_path)
        
        initial_results = model.run()
        
        var_map = {
            re.sub(r'["\']', '', col).replace(' ', '_').lower(): col
            for col in initial_results.columns
        }
        
        original_var_name_found = var_map.get(var_to_modify_clean.lower())

        if original_var_name_found is None:
            return jsonify({"error": f"La variable '{var_to_modify_clean.replace('_', ' ')}' no se encontró en las salidas del modelo."}), 400
        
        # ==================================================
        # || LA CORRECCIÓN DEFINITIVA ESTÁ AQUÍ           ||
        # ==================================================
        # 1. Copiamos la serie de datos original de la variable desde los resultados iniciales.
        param_series = initial_results[original_var_name_found].copy()
        
        # 2. Modificamos la serie copiada con el nuevo valor a partir del tiempo especificado.
        param_series.loc[param_series.index >= start_time] = new_value

        # 3. Ejecutamos la simulación final pasando esta serie modificada como parámetro.
        final_results_df = model.run(params={original_var_name_found: param_series})
        
        final_results_df = final_results_df.reset_index()
        final_results_df = clean_column_names(final_results_df)
        
        return jsonify(final_results_df.to_json(orient='records'))

    except Exception as e:
        return jsonify({"error": f"Error en la re-simulación: {type(e).__name__} - {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
