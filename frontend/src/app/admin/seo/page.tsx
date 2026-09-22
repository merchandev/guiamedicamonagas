'use client';

import React, { useState } from 'react';

export default function SeoAdminPage() {
  const [activeTab, setActiveTab] = useState('global');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Configuración SEO guardada correctamente.");
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Configuración SEO (Estilo Yoast)</h1>
        <span className="bg-green-100 text-green-800 text-sm font-semibold px-3 py-1 rounded-full">SEO Bueno</span>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        
        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'global' ? 'bg-white border-t-2 border-t-blue-600 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('global')}
          >
            Ajustes Generales
          </button>
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'pages' ? 'bg-white border-t-2 border-t-blue-600 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('pages')}
          >
            Páginas Principales
          </button>
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'social' ? 'bg-white border-t-2 border-t-blue-600 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('social')}
          >
            Redes Sociales (OpenGraph)
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6">
          
          {activeTab === 'global' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Nombre del Sitio</label>
                <input type="text" defaultValue="Guía Médica Monagas" className="w-full border rounded-lg p-2" />
                <p className="text-xs text-gray-500 mt-1">Este nombre se añadirá al final del título de cada página.</p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Separador de Título</label>
                <select className="border rounded-lg p-2 w-32">
                  <option value="-">-</option>
                  <option value="|">|</option>
                  <option value="•">•</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Robots.txt y Visibilidad</label>
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" id="index" defaultChecked className="w-4 h-4 text-blue-600" />
                  <label htmlFor="index" className="text-sm">Permitir que los motores de búsqueda indexen este sitio</label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">Página de Inicio</h3>
              
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Título SEO</label>
                <input type="text" defaultValue="Directorio de Médicos y Especialistas en Monagas" className="w-full border rounded-lg p-2" />
                <div className="w-full bg-gray-200 h-1 mt-1 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full w-3/4"></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Longitud óptima: entre 40 y 60 caracteres.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Meta Descripción</label>
                <textarea rows={3} defaultValue="Encuentra a los mejores médicos, clínicas y farmacias en Maturín y todo el estado Monagas. Agenda tu cita y consulta información verificada." className="w-full border rounded-lg p-2"></textarea>
                <div className="w-full bg-gray-200 h-1 mt-1 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full w-[90%]"></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Longitud óptima: entre 120 y 156 caracteres.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Frase clave objetivo (Focus Keyword)</label>
                <input type="text" defaultValue="medicos en monagas" className="w-full border rounded-lg p-2" />
              </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Imagen de Facebook / Twitter (og:image)</label>
                <div className="border-2 border-dashed rounded-lg p-8 text-center bg-gray-50 cursor-pointer hover:bg-gray-100">
                  <span className="text-blue-600 font-medium">Sube una imagen</span> o arrástrala aquí
                  <p className="text-xs text-gray-500 mt-2">Recomendado: 1200 x 630 píxeles</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Título para Redes Sociales</label>
                <input type="text" placeholder="Si se deja vacío, usará el título SEO" className="w-full border rounded-lg p-2" />
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t flex justify-end">
            <button type="submit" className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
              Guardar Cambios
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
