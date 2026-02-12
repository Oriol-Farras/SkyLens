import './App.css';
import FaceRecognition from './components/FaceRecognition';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>✈ SkyLens</h1>
          <p>Control de Acceso Biométrico</p>
        </div>
      </header>

      <main className="app-main">
        <FaceRecognition />
      </main>
      <footer className="app-footer">
        <p>Trabajo de Fin de Grado - Ingeniería Informática</p>
      </footer>
    </div>
  );
}

export default App;