'use client';
import { AdminAccountManager } from '@/components/AdminAccountManager';
import { PatientVaultGate } from '@/components/PatientVaultGate';

export default function PatientAccountsPage() {
  return <PatientVaultGate><AdminAccountManager kind="patients" /></PatientVaultGate>;
}
