
export async function getTaskStatus(trackingId: string, token?: string) {
  const res = await fetch(`/api/tasks/${trackingId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Status ${res.status}: ${text || res.statusText}`);
  }
  return res.json(); // επιστρέφει π.χ. { status: "RUNNING" }
}