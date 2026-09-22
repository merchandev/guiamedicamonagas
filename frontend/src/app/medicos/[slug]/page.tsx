import React from 'react';

// Mock data to demonstrate the UI until the API is fully integrated
const mockDoctor = {
  name: "Dr. Juan Pérez",
  specialty: "Cardiología",
  bio: "Especialista en cardiología clínica e intervencionista con más de 15 años de experiencia.",
  mppsNumber: "12345",
  colmedMonagasNumber: "9876",
  inpremedicoNumber: "112233",
  address: "Av. Alirio Ugarte Pelayo, Clínica Tierra Santa, Consultorio 12",
  phone: "0414-1234567"
};

export default function DoctorProfilePage({ params }: { params: { slug: string } }) {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-2xl shadow p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
          <div className="w-32 h-32 bg-gray-200 rounded-full flex-shrink-0"></div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{mockDoctor.name}</h1>
            <h2 className="text-xl text-blue-600 font-medium mb-4">{mockDoctor.specialty}</h2>
            <p className="text-gray-600 leading-relaxed">{mockDoctor.bio}</p>
          </div>
        </div>

        {/* Avales Legales y Gremiales (Transparencia Médica) */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            Transparencia Médica y Legal
          </h3>
          <p className="text-sm text-blue-800 mb-4">
            Este profesional ha sido verificado y está legalmente habilitado para ejercer en el estado Monagas y a nivel nacional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">N° MPPS</p>
              <p className="text-lg font-bold text-gray-900">{mockDoctor.mppsNumber || "No especificado"}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Colegio de Médicos Monagas</p>
              <p className="text-lg font-bold text-gray-900">{mockDoctor.colmedMonagasNumber || "No especificado"}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">INPREMEDICO</p>
              <p className="text-lg font-bold text-gray-900">{mockDoctor.inpremedicoNumber || "No especificado"}</p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Dirección de Consulta</h3>
            <p className="text-gray-600">{mockDoctor.address}</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Contacto</h3>
            <p className="text-gray-600">{mockDoctor.phone}</p>
          </div>
        </div>

      </div>
    </div>
  );
}
