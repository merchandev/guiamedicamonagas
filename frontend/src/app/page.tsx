export default function Home() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Bienvenido a la Guía Médica</h2>
      <p>Encuentra profesionales, farmacias y especialidades de forma rápida.</p>
      <ul className="mt-4 space-y-2">
        <li><a href="/medicos" className="text-blue-600 underline">Directorio de Médicos</a></li>
        <li><a href="/especialidades" className="text-blue-600 underline">Especialidades</a></li>
        <li><a href="/farmacias" className="text-blue-600 underline">Farmacias</a></li>
      </ul>
    </div>
  );
}
