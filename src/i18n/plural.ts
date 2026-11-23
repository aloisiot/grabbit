// Plural and number helpers bound to one locale, used inside message files.

export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/**
 * `plural(3, { one: "# video", other: "# videos" })` → "3 videos".
 * `#` is replaced by the number formatted for the locale.
 */
export function makePlural(locale: string) {
  const rules = new Intl.PluralRules(locale);
  const num = new Intl.NumberFormat(locale);
  return (n: number, forms: PluralForms): string => {
    const form = forms[rules.select(n) as keyof PluralForms] ?? forms.other;
    return form.replace(/#/g, num.format(n));
  };
}
