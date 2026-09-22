'use client';

import React, { useState } from 'react';

// Mock data
const mockPayments = [
  {
    id: "pay_1",
    doctorName: "Dr. Juan Pérez",
    bank: "Banesco",
    phone: "0414-1112233",
    reference: "456789",
    amount: "100.00",
    date: "2026-09-21",
    status: "PENDING"
  },
  {
    id: "pay_2",
    doctorName: "Dra. María Gómez",
    bank: "Mercantil",
    phone: "0412-9998877",
    reference: "123123",
    amount: "100.00",
    date: "2026-09-20",
    status: "COMPLETED"
  }
];

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState(mockPayments);

  const handleApprove = (id: string) => {
    setPayments(payments.map(p => p.id === id ? { ...p, status: 'COMPLETED' } : p));
    alert("Pago aprobado y suscripción activada.");
  };

  const handleReject = (id: string) => {
    setPayments(payments.map(p => p.id === id ? { ...p, status: 'FAILED' } : p));
    alert("Pago rechazado.");
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Verificación de Pagos Móviles</h1>
      
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-sm font-medium text-gray-600">Profesional</th>
              <th className="p-4 text-sm font-medium text-gray-600">Fecha</th>
              <th className="p-4 text-sm font-medium text-gray-600">Banco Emisor</th>
              <th className="p-4 text-sm font-medium text-gray-600">Teléfono</th>
              <th className="p-4 text-sm font-medium text-gray-600">Referencia</th>
              <th className="p-4 text-sm font-medium text-gray-600">Monto (Bs)</th>
              <th className="p-4 text-sm font-medium text-gray-600">Estado</th>
              <th className="p-4 text-sm font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map(payment => (
              <tr key={payment.id} className="hover:bg-gray-50">
                <td className="p-4 text-sm font-medium">{payment.doctorName}</td>
                <td className="p-4 text-sm">{payment.date}</td>
                <td className="p-4 text-sm">{payment.bank}</td>
                <td className="p-4 text-sm">{payment.phone}</td>
                <td className="p-4 text-sm font-mono bg-yellow-50">{payment.reference}</td>
                <td className="p-4 text-sm font-semibold">{payment.amount}</td>
                <td className="p-4 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {payment.status === 'PENDING' ? 'Pendiente' : payment.status === 'COMPLETED' ? 'Aprobado' : 'Rechazado'}
                  </span>
                </td>
                <td className="p-4 text-sm">
                  {payment.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(payment.id)} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs">
                        Aprobar
                      </button>
                      <button onClick={() => handleReject(payment.id)} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs">
                        Rechazar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
