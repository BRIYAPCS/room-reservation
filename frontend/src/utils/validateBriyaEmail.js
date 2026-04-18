/**
 * Validates a @briya.org email address against the directory.
 * Placeholder — returns invalid until a real backend endpoint is wired up.
 *
 * @param {string} email - A @briya.org email address
 * @returns {Promise<{ valid: boolean, name: string }>}
 */
export async function validateBriyaEmail(email) {
  // TODO: replace with real API call once backend endpoint exists
  // Example real implementation:
  //   const res = await fetch(`/api/auth/validate-email?email=${encodeURIComponent(email)}`)
  //   if (!res.ok) return { valid: false, name: '' }
  //   return res.json()
  void email
  return { valid: false, name: '' }
}
