export const ECG_SYMPTOMS = ['none', 'palpitations', 'dizzy', 'shortBreath', 'chestPain'] as const;
export type EcgSymptom = (typeof ECG_SYMPTOMS)[number];

export function isEcgSymptom(value: string): value is EcgSymptom {
  return (ECG_SYMPTOMS as readonly string[]).includes(value);
}

export function normalizeEcgSymptoms(symptoms: readonly string[]): EcgSymptom[] {
  const known = ECG_SYMPTOMS.filter((symptom) => symptoms.includes(symptom));
  const felt = known.filter((symptom) => symptom !== 'none');
  return felt.length > 0 ? felt : known;
}

export function parseEcgSymptoms(text: string): EcgSymptom[] {
  return normalizeEcgSymptoms(text.split(',').map((part) => part.trim()));
}
