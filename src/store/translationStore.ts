import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@/lib/translations';
import { t as translateT, translateText, translateBatch, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '@/lib/translations';

interface TranslationCache {
  [key: string]: {
    [lang: string]: string;
  };
}

// Store original texts in Portuguese
interface OriginalTexts {
  inspection: {
    descricao: string;
  };
  photos: Array<{
    id: string;
    description: string;
    partName: string;
  }>;
  conclusion: string;
  // For Home tab
  categories: Array<{
    id: string;
    photos: Array<{
      id: string;
      description: string;
    }>;
  }>;
}

interface TranslationState {
  // Current language
  language: Language;
  
  // Translation cache for dynamic texts
  cache: TranslationCache;
  
  // Loading states
  isTranslating: boolean;
  
  // Original texts (stored in Portuguese)
  originalTexts: OriginalTexts | null;
  
  // Actions
  setLanguage: (lang: Language) => void;
  
  // Get static translation (use useTranslation hook for reactive updates)
  t: (key: string, params?: Record<string, string | number>) => string;
  
  // Translate dynamic text (with caching)
  translateDynamic: (text: string) => Promise<string>;
  
  // Translate batch of dynamic texts
  translateDynamicBatch: (texts: string[]) => Promise<string[]>;
  
  // Clear cache
  clearCache: () => void;
  
  // Get language info
  getLanguageName: (lang?: Language) => string;
  getLanguageFlag: (lang?: Language) => string;
  
  // Store original texts
  setOriginalTexts: (texts: OriginalTexts) => void;
  
  // Pre-translate all dynamic content in the report
  preTranslateReport: (data: {
    inspection: Record<string, unknown>;
    photos: Array<Record<string, unknown>>;
    conclusion: string;
  }) => Promise<{
    inspection: Record<string, unknown>;
    photos: Array<Record<string, unknown>>;
    conclusion: string;
  }>;
  
  // Translate all report content (returns translated data)
  translateAllContent: (data: {
    inspectionDescricao?: string;
    photos: Array<{ id: string; description: string; partName?: string }>;
    conclusion: string;
    categories?: Array<{ id: string; photos: Array<{ id: string; description: string }> }>;
  }) => Promise<{
    inspectionDescricao: string;
    photos: Array<{ id: string; description: string; partName?: string }>;
    conclusion: string;
    categories?: Array<{ id: string; photos: Array<{ id: string; description: string }> }>;
  }>;
}

// Custom hook that returns a reactive translation function
export function useTranslation() {
  const language = useTranslationStore((state) => state.language);
  const setLanguage = useTranslationStore((state) => state.setLanguage);
  
  // Create a fresh translation function each render based on current language
  const t = (key: string, params?: Record<string, string | number>) => 
    translateT(key, language, params);
  
  return { language, setLanguage, t };
}

export const useTranslationStore = create<TranslationState>()(
  persist(
    (set, get) => ({
      language: 'pt',
      cache: {},
      isTranslating: false,
      originalTexts: null,
      
      setLanguage: (lang) => set({ language: lang }),
      
      t: (key, params) => {
        const state = get();
        return translateT(key, state.language, params);
      },
      
      getT: () => {
        const state = get();
        return (key: string, params?: Record<string, string | number>) => 
          translateT(key, state.language, params);
      },
      
      translateDynamic: async (text) => {
        if (!text || text.trim() === '') return text;
        
        const state = get();
        const currentLang = state.language;
        
        // If Portuguese, return original
        if (currentLang === 'pt') return text;
        
        // Check cache
        const cacheKey = text.trim().toLowerCase();
        if (state.cache[cacheKey]?.[currentLang]) {
          return state.cache[cacheKey][currentLang];
        }
        
        // Translate
        set({ isTranslating: true });
        try {
          const translation = await translateText(text, currentLang, 'pt');
          
          // Update cache
          set((state) => ({
            cache: {
              ...state.cache,
              [cacheKey]: {
                ...state.cache[cacheKey],
                [currentLang]: translation,
              },
            },
            isTranslating: false,
          }));
          
          return translation;
        } catch (error) {
          set({ isTranslating: false });
          return text;
        }
      },
      
      translateDynamicBatch: async (texts) => {
        if (!texts || texts.length === 0) return texts;
        
        const state = get();
        const currentLang = state.language;
        
        // If Portuguese, return originals
        if (currentLang === 'pt') return texts;
        
        // Find texts that need translation (not in cache)
        const translations: string[] = [...texts];
        const toTranslate: { index: number; text: string }[] = [];
        
        texts.forEach((text, index) => {
          if (!text || text.trim() === '') return;
          
          const cacheKey = text.trim().toLowerCase();
          if (state.cache[cacheKey]?.[currentLang]) {
            translations[index] = state.cache[cacheKey][currentLang];
          } else {
            toTranslate.push({ index, text });
          }
        });
        
        // If all cached, return
        if (toTranslate.length === 0) return translations;
        
        // Translate batch
        set({ isTranslating: true });
        try {
          const textsToTranslate = toTranslate.map(t => t.text);
          const newTranslations = await translateBatch(textsToTranslate, currentLang, 'pt');
          
          // Update translations and cache
          const newCache: TranslationCache = { ...state.cache };
          toTranslate.forEach((item, i) => {
            translations[item.index] = newTranslations[i];
            const cacheKey = item.text.trim().toLowerCase();
            newCache[cacheKey] = {
              ...newCache[cacheKey],
              [currentLang]: newTranslations[i],
            };
          });
          
          set({ cache: newCache, isTranslating: false });
          return translations;
        } catch (error) {
          set({ isTranslating: false });
          return texts;
        }
      },
      
      clearCache: () => set({ cache: {} }),
      
      getLanguageName: (lang) => {
        return LANGUAGE_NAMES[lang || get().language];
      },
      
      getLanguageFlag: (lang) => {
        return LANGUAGE_FLAGS[lang || get().language];
      },
      
      preTranslateReport: async (data) => {
        const state = get();
        const currentLang = state.language;
        
        if (currentLang === 'pt') return data;
        
        set({ isTranslating: true });
        
        try {
          // Collect all texts to translate
          const textsToTranslate: string[] = [];
          
          // From inspection
          if (data.inspection.descricao) textsToTranslate.push(data.inspection.descricao as string);
          
          // From photos
          data.photos.forEach(photo => {
            if (photo.description) textsToTranslate.push(photo.description as string);
            if (photo.partName) textsToTranslate.push(photo.partName as string);
          });
          
          // From conclusion
          if (data.conclusion) textsToTranslate.push(data.conclusion);
          
          // Translate all
          const translations = await translateBatch(textsToTranslate, currentLang, 'pt');
          
          // Apply translations
          let translationIndex = 0;
          const translatedInspection = { ...data.inspection };
          if (translatedInspection.descricao) {
            translatedInspection.descricao = translations[translationIndex++];
          }
          
          const translatedPhotos = data.photos.map(photo => {
            const translatedPhoto = { ...photo };
            if (translatedPhoto.description) {
              translatedPhoto.description = translations[translationIndex++];
            }
            if (translatedPhoto.partName) {
              translatedPhoto.partName = translations[translationIndex++];
            }
            return translatedPhoto;
          });
          
          let translatedConclusion = data.conclusion;
          if (translatedConclusion) {
            translatedConclusion = translations[translationIndex];
          }
          
          set({ isTranslating: false });
          
          return {
            inspection: translatedInspection,
            photos: translatedPhotos,
            conclusion: translatedConclusion,
          };
        } catch (error) {
          set({ isTranslating: false });
          return data;
        }
      },
      
      setOriginalTexts: (texts) => set({ originalTexts: texts }),
      
      translateAllContent: async (data) => {
        const state = get();
        const currentLang = state.language;
        
        // If Portuguese, return originals
        if (currentLang === 'pt') {
          return {
            inspectionDescricao: data.inspectionDescricao || '',
            photos: data.photos,
            conclusion: data.conclusion,
            categories: data.categories,
          };
        }
        
        set({ isTranslating: true });
        
        try {
          // Collect all texts to translate
          const textsToTranslate: string[] = [];
          const textMapping: { type: string; indices: number[] }[] = [];
          
          // Inspection descricao
          if (data.inspectionDescricao && data.inspectionDescricao.trim()) {
            textsToTranslate.push(data.inspectionDescricao);
            textMapping.push({ type: 'inspectionDescricao', indices: [textsToTranslate.length - 1] });
          }
          
          // Photos descriptions and partNames
          const photoIndices: { photoIdx: number; field: string; textIdx: number }[] = [];
          data.photos.forEach((photo, photoIdx) => {
            if (photo.description && photo.description.trim()) {
              textsToTranslate.push(photo.description);
              photoIndices.push({ photoIdx, field: 'description', textIdx: textsToTranslate.length - 1 });
            }
            if (photo.partName && photo.partName.trim()) {
              textsToTranslate.push(photo.partName);
              photoIndices.push({ photoIdx, field: 'partName', textIdx: textsToTranslate.length - 1 });
            }
          });
          
          // Conclusion
          if (data.conclusion && data.conclusion.trim()) {
            textsToTranslate.push(data.conclusion);
          }
          const conclusionIdx = textsToTranslate.length - 1;
          
          // Categories photos (for Home tab)
          const categoryPhotoIndices: { catIdx: number; photoIdx: number; textIdx: number }[] = [];
          if (data.categories) {
            data.categories.forEach((cat, catIdx) => {
              cat.photos.forEach((photo, photoIdx) => {
                if (photo.description && photo.description.trim()) {
                  textsToTranslate.push(photo.description);
                  categoryPhotoIndices.push({ catIdx, photoIdx, textIdx: textsToTranslate.length - 1 });
                }
              });
            });
          }
          
          // Translate all texts
          const translations = await translateBatch(textsToTranslate, currentLang, 'pt');
          
          // Build result
          const result = {
            inspectionDescricao: data.inspectionDescricao && data.inspectionDescricao.trim() 
              ? translations[0] 
              : '',
            photos: data.photos.map((photo, photoIdx) => ({
              ...photo,
              description: photoIndices.find(p => p.photoIdx === photoIdx && p.field === 'description')
                ? translations[photoIndices.find(p => p.photoIdx === photoIdx && p.field === 'description')!.textIdx]
                : photo.description,
              partName: photoIndices.find(p => p.photoIdx === photoIdx && p.field === 'partName')
                ? translations[photoIndices.find(p => p.photoIdx === photoIdx && p.field === 'partName')!.textIdx]
                : photo.partName,
            })),
            conclusion: data.conclusion && data.conclusion.trim()
              ? translations[conclusionIdx]
              : '',
            categories: data.categories ? data.categories.map((cat, catIdx) => ({
              ...cat,
              photos: cat.photos.map((photo, photoIdx) => ({
                ...photo,
                description: categoryPhotoIndices.find(c => c.catIdx === catIdx && c.photoIdx === photoIdx)
                  ? translations[categoryPhotoIndices.find(c => c.catIdx === catIdx && c.photoIdx === photoIdx)!.textIdx]
                  : photo.description,
              })),
            })) : undefined,
          };
          
          set({ isTranslating: false });
          return result;
          
        } catch (error) {
          console.error('Translation error:', error);
          set({ isTranslating: false });
          return {
            inspectionDescricao: data.inspectionDescricao || '',
            photos: data.photos,
            conclusion: data.conclusion,
            categories: data.categories,
          };
        }
      },
    }),
    {
      name: 'translation-storage',
      partialize: (state) => ({
        language: state.language,
        cache: state.cache,
      }),
    }
  )
);
