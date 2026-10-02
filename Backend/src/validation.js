export function validateName(name) {
  if (typeof name !== "string" || name.trim().length < 20 || name.trim().length > 60) {
    return "Name must be between 20 and 60 characters.";
  }
}

export function validateAddress(address) {
  if (address && address.length > 400) {
    return "Address must not exceed 400 characters.";
  }
}

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== "string" || !re.test(email)) {
    return "Enter a valid email address.";
  }
}

export function validatePassword(password) {
  const re = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}$/;
  if (typeof password !== "string" || !re.test(password)) {
    return "Password must be 8–16 characters and contain at least one uppercase letter and one special character.";
  }
}

export function validateRating(rating) {
  if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    return "Rating must be an integer from 1 to 5.";
  }
}

export function validateUser(data, { requirePassword = true } = {}) {
  const errors = {};
  const fields = [
    ["name", validateName(data.name)],
    ["email", validateEmail(data.email)],
    ["address", validateAddress(data.address)]
  ];
  if (requirePassword) fields.push(["password", validatePassword(data.password)]);
  for (const [key, value] of fields) if (value) errors[key] = value;
  return errors;
}
