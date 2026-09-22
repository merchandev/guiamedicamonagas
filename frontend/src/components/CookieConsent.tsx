'use client';

import React, { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Configuración de Cookies</h3>
          <p className="text-sm text-gray-600">
            Utilizamos cookies propias y de terceros para mejorar nuestros servicios, personalizar nuestro sitio web y analizar sus hábitos de navegación. Si continúa navegando, consideramos que acepta su uso.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/privacidad" className="text-sm text-blue-600 hover:underline font-medium whitespace-nowrap">
            Más información
          </a>
          <button 
            onClick={acceptCookies}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  );
}
