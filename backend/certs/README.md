# Certificado intermedio para consultar el BCV

`sectigo-dv-r36.pem` es un certificado público, no una clave ni una credencial.
El 23/09/2026 el servidor `www.bcv.org.ve` omitía este intermedio en su cadena TLS.
Se obtuvo desde el URI AIA del certificado del servidor:
http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt

Se convirtió de DER a PEM y se verificó con `openssl verify` contra el almacén
de confianza del VPS (resultado OK). Su emisor es Sectigo Public Server
Authentication Root R46 y su vigencia termina el 21/03/2036.

Solo se añade a la conexión HTTPS del scraper del BCV. Se mantienen las raíces
de confianza de Node y la validación del nombre de servidor, fechas y firma.
No se usa `rejectUnauthorized: false` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`.
Si el BCV cambia de emisor, revisar la nueva cadena y actualizar este archivo
solo después de verificarla; una falla debe conservar la tasa anterior y
mostrar el aviso de sincronización.
