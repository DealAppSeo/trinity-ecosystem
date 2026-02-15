import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        resources: {
            en: {
                common: {
                    app_title: "Trinity Symphony",
                    voice_placeholder: "Speak to Trinity...",
                    energy_mode: "Energy Mode",
                    eco_bonus: "Eco Bonus",
                    tiers: {
                        seedling: "Seedling",
                        sapling: "Sapling",
                        grove: "Grove",
                        forest: "Forest",
                        canopy: "Canopy"
                    }
                }
            },
            es: {
                common: {
                    app_title: "Sinfonía Trinity",
                    voice_placeholder: "Habla con Trinity...",
                    energy_mode: "Modo de Energía",
                    eco_bonus: "Bono Eco",
                    tiers: {
                        seedling: "Plántula",
                        sapling: "Retoño",
                        grove: "Arboleda",
                        forest: "Bosque",
                        canopy: "Dosel"
                    }
                }
            }
        }
    });

export default i18n;
