
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { FC, InputHTMLAttributes } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore, Timestamp } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChevronDown, BarChart2, PlusCircle, AlertTriangle, Database, Upload } from 'lucide-react';

// --- Type Definitions for TypeScript ---
interface DataRow {
  TIME: number;
  [key: string]: number;
}

interface Scenario {
  id: string;
  name: string;
  data: DataRow[];
  isBase?: boolean;
  createdAt?: Timestamp;
}

interface FirebaseConfig {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
}

// --- Sample Data for when backend is not running ---
const generateBaseScenarioData = (): DataRow[] => {
    const data: DataRow[] = [];
    let stock = 1000;
    for (let year = 2020; year <= 2050; year++) {
        const inflow = 50 + Math.random() * 10 - 5;
        const outflow = 40 + Math.random() * 5 - 2.5;
        stock += (inflow - outflow);
        data.push({
            TIME: year,
            Poblacion: stock,
            Tasa_de_Natalidad: inflow / 1000,
            Tasa_de_Mortalidad: outflow / 1000,
        });
    }
    return data;
};

const BASE_SCENARIO = {
    name: "Escenario Base de Ejemplo",
    data: generateBaseScenarioData(),
};

// --- Firebase Config ---
const firebaseConfig: FirebaseConfig = {
     apiKey: "AIzaSyAr8Vpz-530USM_oHFJcIM3edwZxSJEaxs",
  authDomain: "visor-vensim-web.firebaseapp.com",
  projectId: "visor-vensim-web",
  storageBucket: "visor-vensim-web.firebasestorage.app",
  messagingSenderId: "679190347459",
  appId: "1:679190347459:web:17f430e578ad1bc0712c76",
  measurementId: "G-H8FEWLMXKZ"
};

const appId = 'vensim-app-local';

// --- Main App Component ---
export default function App() {
    const [db, setDb] = useState<Firestore | null>(null);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

    const activeScenario = useMemo(() => scenarios.find(s => s.id === activeScenarioId), [scenarios, activeScenarioId]);
    
    useEffect(() => {
        if (!firebaseConfig.apiKey) {
            const localBaseScenario: Scenario = { ...BASE_SCENARIO, id: 'local-base', isBase: true };
            setScenarios([localBaseScenario]);
            setActiveScenarioId('local-base');
            setIsLoading(false);
            return;
        }
        try {
            const app: FirebaseApp = initializeApp(firebaseConfig);
            const firestore: Firestore = getFirestore(app);
            const authInstance: Auth = getAuth(app);
            setDb(firestore);
            onAuthStateChanged(authInstance, async (user) => {
                if (!user) await signInAnonymously(authInstance);
                setIsAuthReady(true);
            });
        } catch (error) {
            console.error("Firebase initialization error:", error);
            setIsAuthReady(true);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady || !db) return;
        setIsLoading(true);
        const q = collection(db, `/artifacts/${appId}/public/data/scenarios`);
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const scenariosData: Scenario[] = [];
            let foundBase = false;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if(data.isBase) foundBase = true;
                scenariosData.push({ id: doc.id, name: data.name, data: JSON.parse(data.data || '[]'), isBase: data.isBase, createdAt: data.createdAt });
            });
            if (scenariosData.length === 0 && !foundBase) {
                 handleAddScenario({ name: BASE_SCENARIO.name, data: BASE_SCENARIO.data, isBase: true });
            } else {
                 setScenarios(scenariosData.sort((a, b) => (a.createdAt && b.createdAt) ? b.createdAt.toMillis() - a.createdAt.toMillis() : 0));
                 if (!activeScenarioId && scenariosData.length > 0) setActiveScenarioId(scenariosData[0].id);
            }
            setIsLoading(false);
        }, (error) => { console.error("Error fetching scenarios:", error); setIsLoading(false); });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    const handleAddScenario = async (newScenario: { name: string, data: DataRow[], isBase?: boolean }) => {
        if (!db) {
            const localNewScenario: Scenario = { ...newScenario, id: `local-${Date.now()}` };
            setScenarios(prev => [...prev, localNewScenario]);
            setActiveScenarioId(localNewScenario.id);
            alert("Modo offline. El escenario no se guardará permanentemente.");
            return;
        }
        try {
            const docRef = await addDoc(collection(db, `/artifacts/${appId}/public/data/scenarios`), {
                ...newScenario,
                data: JSON.stringify(newScenario.data),
                createdAt: serverTimestamp(),
            });
            setActiveScenarioId(docRef.id);
        } catch (error) { console.error("Error creando escenario:", error); }
    };

    if (isLoading && firebaseConfig.apiKey) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><div className="flex flex-col items-center"><Database className="w-16 h-16 animate-pulse text-cyan-400" /><p className="mt-4 text-lg">Cargando datos de escenarios...</p></div></div>;
    }
    
    return (
        <div className="flex h-screen bg-[#242424] text-[#EAEAEA] font-sans">
            <ControlPanel onAddScenarioFromBackend={handleAddScenario} />
            <main className="flex-1 flex flex-col p-4 overflow-hidden">
                 <div className="flex-1 bg-[#2E2E2E] rounded-lg shadow-xl flex flex-col overflow-hidden">
                    <DisplayTabs 
                        activeScenario={activeScenario}
                        scenarios={scenarios}
                        onAddScenario={handleAddScenario}
                        onScenarioChange={setActiveScenarioId}
                    />
                 </div>
            </main>
        </div>
    );
}

// --- Component Props Interfaces ---
interface ControlPanelProps { onAddScenarioFromBackend: (scenario: { name: string, data: DataRow[], isBase: boolean }) => void; }
interface DisplayTabsProps { activeScenario: Scenario | undefined; scenarios: Scenario[]; onAddScenario: (scenario: { name: string; data: DataRow[]; isBase?: boolean; }) => void; onScenarioChange: (id: string) => void; }
interface DataViewerTabProps { data: DataRow[]; }
interface PlotConfigTabProps { scenario: Scenario; scenarios: Scenario[]; }
interface ModifyScenarioTabProps { baseScenarios: Scenario[]; onAddScenario: (scenario: { name: string; data: DataRow[]; isBase?: boolean; }) => void; }

// --- UI Components ---

const ControlPanel: FC<ControlPanelProps> = ({ onAddScenarioFromBackend }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const scenarioName = prompt("Introduce un nombre para este nuevo escenario base:", file.name.replace(/\.mdl$/i, ''));
        if (!scenarioName) { if(event.target) event.target.value = ''; return; }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('scenarioName', scenarioName);

        try {
            const response = await fetch('https://analizador-vensim-backend.onrender.com/simulate', { method: 'POST', body: formData });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `Error del servidor: ${response.status}`); }
            const resultsJsonString = await response.json();
            const parsedData = JSON.parse(resultsJsonString) as DataRow[];
            onAddScenarioFromBackend({ name: scenarioName, data: parsedData, isBase: true });
        } catch (error) {
            console.error("Error al subir el modelo:", error);
            alert(`No se pudo procesar el modelo. Asegúrate de que el servidor de Python (server.py) esté ejecutándose y que el archivo .mdl sea válido.\n\nError: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsUploading(false);
            if(event.target) event.target.value = '';
        }
    };

    const handleUploadClick = () => { fileInputRef.current?.click(); };

    return (
        <aside className="w-64 bg-[#2E2E2E] p-4 flex flex-col space-y-6 shadow-2xl">
            <div className="flex items-center space-x-3"><BarChart2 className="text-[#5DADE2] w-8 h-8" /><h1 className="text-xl font-bold text-[#5DADE2]">Analizador Vensim</h1></div>
            <div className="flex-1 space-y-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Control Principal</h2>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".mdl" style={{ display: 'none' }} />
                <Button onClick={handleUploadClick} disabled={isUploading} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-500">
                    <Upload className={`w-4 h-4 mr-2 ${isUploading ? 'animate-pulse' : ''}`} />
                    {isUploading ? 'Procesando...' : 'Cargar Modelo (.mdl)'}
                </Button>
                <div className="p-4 bg-gray-800/50 rounded-lg text-xs text-gray-400">
                    <p><strong className="text-gray-300">Nota:</strong> El servidor de Python (`server.py`) debe estar ejecutándose para cargar nuevos modelos Vensim.</p>
                </div>
            </div>
            <div className="text-xs text-center text-gray-500"><p>Versión Web v2.3.0</p></div>
        </aside>
    );
};

const DisplayTabs: FC<DisplayTabsProps> = ({ activeScenario, scenarios, onAddScenario, onScenarioChange }) => {
    const [activeTab, setActiveTab] = useState('data');
    const tabs = [{ id: 'data', label: 'Visor de Datos' },{ id: 'plot', label: 'Configurar Gráfica' },{ id: 'modify', label: 'Modificar Escenario' }];
    const scenarioOptions = useMemo(() => scenarios.map(s => ({ value: s.id, label: s.name })), [scenarios]);
    const renderContent = () => {
        if (!activeScenario) return <div className="flex flex-col items-center justify-center h-full text-gray-400"><AlertTriangle className="w-12 h-12 mb-4"/><h3 className="text-xl font-semibold">Ningún escenario seleccionado</h3><p>Carga o selecciona un escenario.</p></div>
        switch (activeTab) {
            case 'data': return <DataViewerTab data={activeScenario.data} />;
            case 'plot': return <PlotConfigTab scenario={activeScenario} scenarios={scenarios} />;
            case 'modify': return <ModifyScenarioTab baseScenarios={scenarios.filter(s => s.isBase)} onAddScenario={onAddScenario} />;
            default: return null;
        }
    };
    return (<div className="flex flex-col h-full"><div className="flex border-b border-gray-700 px-4 items-center"><div className="flex-1">{tabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-3 px-5 text-sm font-medium transition-colors duration-200 focus:outline-none ${activeTab === tab.id ? 'border-b-2 border-[#007ACC] text-white' : 'text-gray-400 hover:text-white'}`}>{tab.label}</button>))}</div><div className="w-56"><label className="text-xs text-gray-400 mr-2">Escenario Activo:</label><Select value={activeScenario?.id || ''} onChange={e => onScenarioChange(e.target.value)}>{scenarioOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</Select></div></div><div className="flex-1 overflow-auto p-4 bg-[#242424] rounded-b-lg">{renderContent()}</div></div>);
};

const ModifyScenarioTab: FC<ModifyScenarioTabProps> = ({ baseScenarios, onAddScenario }) => {
    const [baseScenarioName, setBaseScenarioName] = useState<string>('');
    const [varToModify, setVarToModify] = useState<string>('');
    const [newValue, setNewValue] = useState<string>('');
    const [startTime, setStartTime] = useState<string>('');
    const [newScenarioName, setNewScenarioName] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isSimulating, setIsSimulating] = useState(false);

    const selectedBaseScenario = useMemo(() => baseScenarios.find(s => s.name === baseScenarioName), [baseScenarios, baseScenarioName]);
    const varOptions = useMemo(() => selectedBaseScenario?.data?.[0] ? Object.keys(selectedBaseScenario.data[0]).filter(k => k !== 'TIME') : [], [selectedBaseScenario]);

    useEffect(() => {
        if (baseScenarios.length > 0 && !baseScenarioName) {
            setBaseScenarioName(baseScenarios[0].name);
        }
    }, [baseScenarios, baseScenarioName]);

    useEffect(() => {
        if (varOptions.length > 0) {
            setVarToModify(varOptions[0]);
        }
    }, [varOptions]);

    const handleCreateScenario = async () => {
        setError('');
        if (!baseScenarioName || !varToModify || !newValue || !startTime || !newScenarioName) { 
            return setError("Todos los campos son obligatorios.");
        }

        setIsSimulating(true);
        const payload = {
            base_scenario_name: baseScenarioName,
            variable_to_modify: varToModify,
            new_value: newValue,
            start_time: startTime,
        };

        try {
                const response = await fetch('https://analizador-vensim-backend.onrender.com/resimulate', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error del servidor'); }
            
            const resultsJsonString = await response.json();
            const parsedData = JSON.parse(resultsJsonString) as DataRow[];
            
            onAddScenario({ name: newScenarioName, data: parsedData, isBase: false });
            setNewValue('');
            setNewScenarioName('');
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ocurrió un error desconocido.');
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <Card className="max-w-md mx-auto">
            <h3 className="text-lg font-semibold text-[#5DADE2] mb-4">Re-simular Escenario</h3>
            <p className="text-xs text-gray-400 mb-4">Modifica un parámetro de un modelo base. Esto ejecutará una simulación completa en el servidor usando el modelo previamente cargado.</p>
            <div className="space-y-4">
                <div><label className="text-sm font-medium">1. Selecciona el Modelo Base</label>
                    <Select value={baseScenarioName} onChange={e => setBaseScenarioName(e.target.value)} disabled={baseScenarios.length === 0}>
                        {baseScenarios.length > 0 ? (
                            baseScenarios.map(s => <option key={s.id} value={s.name}>{s.name}</option>)
                        ) : (
                            <option>No hay modelos base cargados</option>
                        )}
                    </Select>
                </div>
                <div><label className="text-sm font-medium">2. Variable del Modelo a modificar</label>
                    <Select value={varToModify} onChange={e => setVarToModify(e.target.value)} disabled={varOptions.length === 0}>
                        {varOptions.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                    </Select>
                </div>
                <div><label className="text-sm font-medium">3. Nuevo valor</label><Input type="number" placeholder="e.g., 1.5" value={newValue} onChange={e => setNewValue(e.target.value)} /></div>
                <div><label className="text-sm font-medium">4. A partir del año (TIME)</label><Input type="number" placeholder="e.g., 2030" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                <div><label className="text-sm font-medium">5. Nombre del nuevo escenario</label><Input type="text" placeholder="e.g., Escenario con alta inversión" value={newScenarioName} onChange={e => setNewScenarioName(e.target.value)} /></div>
                {error && <p className="text-sm text-red-400 p-2 bg-red-900/50 rounded">{error}</p>}
                <Button onClick={handleCreateScenario} disabled={isSimulating || baseScenarios.length === 0} className="w-full">
                    <PlusCircle className={`w-4 h-4 mr-2 ${isSimulating ? 'animate-spin' : ''}`} />
                    {isSimulating ? 'Re-simulando...' : 'Crear Escenario Modificado'}
                </Button>
            </div>
        </Card>
    );
};

const DataViewerTab: FC<DataViewerTabProps> = ({ data }) => { if (!data || data.length === 0) return <p>No hay datos para mostrar.</p>; const headers = Object.keys(data[0]); const formatValue = (key: string, value: number) => key.toLowerCase().includes('tasa') ? value.toFixed(3) : value.toFixed(2); return (<div className="overflow-auto h-full"><table className="w-full text-sm text-left text-gray-300"><thead className="text-xs text-[#5DADE2] uppercase bg-[#2E2E2E] sticky top-0"><tr>{headers.map(header => <th key={header} scope="col" className="px-6 py-3 font-semibold">{header.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{data.map((row, rowIndex) => (<tr key={rowIndex} className={`${rowIndex % 2 === 0 ? 'bg-[#292929]' : 'bg-[#343638]'} border-b border-gray-700`}>{headers.map(header => (<td key={header} className="px-6 py-2">{formatValue(header, row[header])}</td>))}</tr>))}</tbody></table></div>); };
interface CompareField { id: number; scenarioId: string; variable: string; }
type PlotDataType = { TIME: number; [key: string]: number; };
const PlotConfigTab: FC<PlotConfigTabProps> = ({ scenario, scenarios }) => { const [plotType, setPlotType] = useState<'single' | 'multi'>('single'); const [singleVar, setSingleVar] = useState<string>(''); const [numCompare, setNumCompare] = useState<number>(2); const [compareFields, setCompareFields] = useState<CompareField[]>([]); const [plotData, setPlotData] = useState<PlotDataType[]>([]); const [plotLines, setPlotLines] = useState<{dataKey: string; name: string; stroke: string}[]>([]); const varOptions = useMemo(() => scenario?.data?.[0] ? Object.keys(scenario.data[0]).filter(k => k !== 'TIME') : [], [scenario]); useEffect(() => { if(varOptions.length > 0) setSingleVar(varOptions[0]); setCompareFields([]); }, [scenario, varOptions]); const handleGenerateCompareFields = () => setCompareFields(Array.from({ length: numCompare }, (_, i) => ({ id: i, scenarioId: scenario.id, variable: varOptions[0] || '' }))); const handleCompareFieldChange = (index: number, field: keyof CompareField, value: string) => { const newFields = [...compareFields]; newFields[index] = { ...newFields[index], [field]: value }; if (field === 'scenarioId') { const newScenarioData = scenarios.find(s => s.id === value); if (newScenarioData?.data?.[0]) { const newVarOptions = Object.keys(newScenarioData.data[0]).filter(k => k !== 'TIME'); newFields[index].variable = newVarOptions[0] || ''; }} setCompareFields(newFields); }; const plotSingle = () => { if (!singleVar) return; setPlotData(scenario.data); setPlotLines([{ dataKey: singleVar, name: `${scenario.name}: ${singleVar.replace(/_/g, ' ')}`, stroke: COLORS[0] }]); }; const plotMulti = () => { const lineConfigs: {dataKey: string; name: string; stroke: string}[] = []; const allData: { [key: number]: PlotDataType } = {}; compareFields.forEach((field, index) => { if(!field.scenarioId || !field.variable) return; const selectedScenario = scenarios.find(s => s.id === field.scenarioId); if(!selectedScenario) return; const dataKey = `${selectedScenario.name}-${field.variable}-${index}`; lineConfigs.push({ dataKey, name: `${selectedScenario.name}: ${field.variable.replace(/_/g, ' ')}`, stroke: COLORS[index % COLORS.length]}); selectedScenario.data.forEach(row => { if (!allData[row.TIME]) allData[row.TIME] = { TIME: row.TIME }; allData[row.TIME][dataKey] = row[field.variable]; }); }); setPlotData(Object.values(allData).sort((a,b) => a.TIME - b.TIME)); setPlotLines(lineConfigs); }; const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE", "#00C49F", "#FFBB28", "#FF8042"]; 
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <div className="bg-[#2E2E2E] rounded-lg p-4 flex flex-col space-y-4">
                <h3 className="text-lg font-semibold text-[#5DADE2]">Configuración</h3>
                <div className="flex space-x-2 bg-[#242424] p-1 rounded-lg">
                    <button onClick={() => setPlotType('single')} className={`flex-1 p-2 rounded-md text-sm transition ${plotType === 'single' ? 'bg-[#007ACC]' : 'hover:bg-gray-700'}`}>Gráfica Simple</button>
                    <button onClick={() => setPlotType('multi')} className={`flex-1 p-2 rounded-md text-sm transition ${plotType === 'multi' ? 'bg-[#007ACC]' : 'hover:bg-gray-700'}`}>Comparativa Múltiple</button>
                </div>
                {plotType === 'single' && (<Card><h4 className="font-semibold mb-2">Variable Única</h4><Select value={singleVar} onChange={e => setSingleVar(e.target.value)}>{varOptions.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}</Select><Button onClick={plotSingle} className="mt-2 w-full">Graficar</Button></Card>)}
                {plotType === 'multi' && (<Card><h4 className="font-semibold mb-2">Comparativa Múltiple</h4><div className="flex items-center space-x-2"><Input type="number" value={numCompare} onChange={e => setNumCompare(Number(e.target.value))} min="2" max="8" /><Button onClick={handleGenerateCompareFields}>Generar Campos</Button></div><div className="mt-4 space-y-3 max-h-60 overflow-y-auto pr-2">{compareFields.map((field, index) => { const currentScenario = scenarios.find(s => s.id === field.scenarioId); const currentVarOptions = currentScenario?.data?.[0] ? Object.keys(currentScenario.data[0]).filter(k => k !== 'TIME') : []; return (<div key={field.id} className="p-2 bg-gray-900/50 rounded-md space-y-2"><p className="text-xs font-bold text-cyan-400">Variable {index + 1}</p><Select value={field.scenarioId} onChange={e => handleCompareFieldChange(index, 'scenarioId', e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Select value={field.variable} onChange={e => handleCompareFieldChange(index, 'variable', e.target.value)}>{currentVarOptions.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}</Select></div>);})}</div>{compareFields.length > 0 && <Button onClick={plotMulti} className="mt-4 w-full">Graficar</Button>}</Card>)}
            </div>
            <div className="bg-[#2E2E2E] rounded-lg p-4 flex flex-col">
                <h3 className="text-lg font-semibold text-[#5DADE2] mb-4">Visualización</h3>
                <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={plotData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                            {/* ================================================== */}
                            {/* || LA CORRECCIÓN ESTÁ AQUÍ                      || */}
                            {/* ================================================== */}
                            <XAxis 
                                dataKey="TIME" 
                                stroke="#EAEAEA" 
                                tick={{ fill: '#EAEAEA', fontSize: 12 }} 
                                interval={0} 
                                angle={-30} 
                                dy={10}
                            />
                            <YAxis 
                                stroke="#EAEAEA" 
                                tick={{ fill: '#EAEAEA', fontSize: 12 }} 
                                domain={[0, 'dataMax']}
                                allowDataOverflow={true}
                            />
                            <Tooltip contentStyle={{ backgroundColor: '#242424', border: '1px solid #555' }} labelStyle={{ color: '#EAEAEA' }}/>
                            <Legend wrapperStyle={{fontSize: "12px"}}/>
                            {plotLines.map(line => <Line key={line.dataKey} type="monotone" {...line} dot={false} />)}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
const Select: FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => (<div className="relative w-full"><select className="w-full appearance-none bg-[#242424] border border-gray-600 text-white py-2 px-3 rounded-md leading-tight focus:outline-none focus:border-[#007ACC] transition-colors" {...props}>{children}</select><div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDown className="w-4 h-4"/></div></div>);
const Input = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (<input className="w-full bg-[#242424] border border-gray-600 text-white py-2 px-3 rounded-md leading-tight focus:outline-none focus:border-[#007ACC] transition-colors" ref={ref} {...props} />));
Input.displayName = 'Input';
const Button: FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', disabled, ...props }) => (<button className={`w-full flex items-center justify-center bg-[#007ACC] hover:bg-[#0096FF] text-white font-bold py-2 px-4 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`} disabled={disabled} {...props}>{children}</button>);
const Card: FC<{children: React.ReactNode, className?: string}> = ({ children, className = '' }) => (<div className={`bg-[#2E2E2E] rounded-lg p-4 shadow ${className}`}>{children}</div>);
