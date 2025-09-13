export async function startTraining(formData: FormData, token?: string) {
  const res = await fetch('/api/train/train-model', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Failed (${res.status})`);
  }
  return res.json(); // επιστρέφει π.χ. { dataHeader: "123" }
}
