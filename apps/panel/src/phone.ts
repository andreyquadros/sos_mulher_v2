export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const international = value.trimStart().startsWith("+");
  if (international && !digits.startsWith("55")) return `+${digits}`;

  const national = international ? digits.slice(2) : digits;
  const prefix = international ? "+55 " : "";
  if (!national) return prefix.trimEnd();
  if (national.length <= 2) return `${prefix}(${national}`;

  const split = national.length > 10 ? 7 : 6;
  const ending = national.slice(split);
  return `${prefix}(${national.slice(0, 2)}) ${national.slice(2, split)}${ending ? `-${ending}` : ""}`;
}

export function isCompletePhone(value: string) {
  return (
    /^(?:\+55 )?\(\d{2}\) \d{4,5}-\d{4}$/.test(value) ||
    /^\+(?!55)[1-9]\d{7,14}$/.test(value)
  );
}

export function maskPhoneInput(input: HTMLInputElement, inputType: string) {
  const formatted = formatPhone(input.value);
  if (formatted === input.value) return;

  const beforeCaret = input.value.slice(
    0,
    input.selectionStart ?? input.value.length,
  );
  let digitsBeforeCaret = beforeCaret.replace(/\D/g, "").length;
  let caret = beforeCaret.includes("+") && formatted.startsWith("+") ? 1 : 0;
  while (digitsBeforeCaret > 0 && caret < formatted.length) {
    if (/\d/.test(formatted[caret])) digitsBeforeCaret--;
    caret++;
  }
  if (inputType === "deleteContentForward") {
    while (caret < formatted.length && !/\d/.test(formatted[caret])) caret++;
  }
  input.value = formatted;
  input.setSelectionRange(caret, caret);
}
