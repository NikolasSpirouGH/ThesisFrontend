export type AlgorithmWeka = {
  id: number;
  name: string;
};


export async function fetchAlgorithms(): Promise<AlgorithmWeka[]> {
  const res = await fetch('/api/algorithms/get-algorithms', {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to load algorithms (${res.status})`);
  }

  return res.json();
}