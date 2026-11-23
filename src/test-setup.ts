// Tests assert English text regardless of the machine's language.
import { useLocale } from "./i18n";

useLocale.getState().setLanguage("en");
