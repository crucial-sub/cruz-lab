interface VerifiedAdminUser {
  email: string;
}

export async function verifyAdminIdToken(idToken: string): Promise<VerifiedAdminUser | null> {
  const apiKey = import.meta.env.PUBLIC_FIREBASE_API_KEY;
  const adminEmail = import.meta.env.PUBLIC_ADMIN_EMAIL;

  if (!apiKey || !adminEmail || !idToken) {
    return null;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const user = data?.users?.[0];

  if (!user?.email || user.email !== adminEmail) {
    return null;
  }

  return { email: user.email };
}
