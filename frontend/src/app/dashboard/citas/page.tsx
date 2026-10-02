import { redirect } from 'next/navigation';

// Las citas ahora viven en la agenda (calendario e historial). Los correos y
// avisos anteriores traen este enlace: lleva al historial.
export default function CitasPage() {
  redirect('/dashboard/agenda/historial');
}
