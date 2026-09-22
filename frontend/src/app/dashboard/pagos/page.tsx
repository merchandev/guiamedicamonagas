'use client';

import React, { useState } from 'react';

export default function ReportPaymentPage() {
  const [amount, setAmount] = useState('100.00'); // Monto en Bs de la suscripción (ejemplo)

  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Reportar Pago Móvil</h1>
      
      <div className="bg-blue-50 border-blue-200 border p-4 rounded-lg mb-6">
        <h3 className="font-semibold text-blue-900 mb-2">Datos para transferir:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><strong>Banco:</strong> Banesco (0134)</li>
          <li><strong>Teléfono:</strong> 0414-1234567</li>
          <li><strong>RIF/Cédula:</strong> J-12345678-9</li>
          <li><strong>Monto a pagar:</strong> Bs. {amount}</li>
        </ul>
      </div>

      <form className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Banco de origen</label>
          <select className="w-full border rounded-lg p-2" required>
            <option value="">Seleccione su banco</option>
            <option value="0102">Banco de Venezuela (0102)</option>
            <option value="0104">Banco Venezolano de Crédito (0104)</option>
            <option value="0105">Mercantil (0105)</option>
            <option value="0108">Provincial (0108)</option>
            <option value="0134">Banesco (0134)</option>
            {/* Otros bancos */}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Número de Teléfono (Emisor)</label>
          <input type="text" className="w-full border rounded-lg p-2" placeholder="04xx-xxxxxxx" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Últimos 4 a 6 dígitos de la Referencia</label>
          <input type="text" className="w-full border rounded-lg p-2" placeholder="Ej. 987654" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha del Pago</label>
          <input type="date" className="w-full border rounded-lg p-2" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Monto enviado (Bs)</label>
          <input type="number" step="0.01" className="w-full border rounded-lg p-2 bg-gray-50" value={amount} readOnly />
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors mt-4">
          Reportar Pago
        </button>
      </form>
    </div>
  );
}
