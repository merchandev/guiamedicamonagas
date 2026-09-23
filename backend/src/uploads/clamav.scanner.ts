import { Socket } from 'net';

const CHUNK_SIZE = 64 * 1024;

/**
 * Cliente mínimo de clamd (protocolo INSTREAM por TCP): envía el archivo en
 * bloques con prefijo de tamaño y lee el veredicto.
 * Devuelve null si está limpio o el nombre de la firma si está infectado.
 */
export function scanWithClamav(host: string, port: number, buffer: Buffer, timeoutMs = 15_000): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let response = '';
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('ClamAV no respondió a tiempo')));
    socket.on('error', fail);
    socket.on('data', (data) => {
      response += data.toString('utf8');
    });
    socket.on('end', () => {
      const verdict = response.replace(/\0/g, '').trim();
      if (verdict.endsWith('OK')) return resolve(null);
      const found = verdict.match(/stream:\s*(.+)\s+FOUND$/);
      if (found) return resolve(found[1]);
      reject(new Error(`Respuesta inesperada de ClamAV: ${verdict}`));
    });
    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
