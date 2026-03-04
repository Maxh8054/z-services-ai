'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Languages, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslationStore } from '@/store/translationStore';
import { useReportStore } from '@/store/reportStore';
import { useHomeReportStore } from '@/store/homeReportStore';
import { LANGUAGE_NAMES, LANGUAGE_FLAGS, type Language } from '@/lib/translations';

interface TextareaContent {
  id: string;
  content: string;
  field: string;
  categoryId?: string;
  photoId?: string;
}

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: 'home' | 'inspecao';
}

export function TranslateDialog({ open, onOpenChange, tab }: TranslateDialogProps) {
  const [sourceLang, setSourceLang] = useState<Language>('pt');
  const [targetLang, setTargetLang] = useState<Language>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState({ current: 0, total: 0 });
  const [translationComplete, setTranslationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setLanguage } = useTranslationStore();
  const inspecaoStore = useReportStore();
  const homeStore = useHomeReportStore();

  // Get fresh text content from stores
  const getTextareaContents = useCallback((): TextareaContent[] => {
    const contents: TextareaContent[] = [];

    if (tab === 'inspecao') {
      const { photos, conclusion, inspection } = inspecaoStore;

      if (inspection.descricao?.trim()) {
        contents.push({
          id: `insp-desc`,
          content: inspection.descricao,
          field: 'inspectionDescricao',
        });
      }

      photos.forEach((photo) => {
        if (photo.description?.trim()) {
          contents.push({
            id: `photo-${photo.id}-desc`,
            content: photo.description,
            field: 'photoDescription',
            categoryId: photo.id,
            photoId: photo.id,
          });
        }
        if (photo.partName?.trim()) {
          contents.push({
            id: `photo-${photo.id}-part`,
            content: photo.partName,
            field: 'photoPartName',
            categoryId: photo.id,
            photoId: photo.id,
          });
        }
      });

      if (conclusion?.trim()) {
        contents.push({
          id: `conclusion`,
          content: conclusion,
          field: 'conclusion',
        });
      }
    } else {
      const { categories, conclusion, inspection } = homeStore;

      if (inspection.descricao?.trim()) {
        contents.push({
          id: `insp-desc`,
          content: inspection.descricao,
          field: 'inspectionDescricao',
        });
      }

      categories.forEach((cat) => {
        cat.photos.forEach((photo) => {
          if (photo.description?.trim()) {
            contents.push({
              id: `cat-${cat.id}-photo-${photo.id}`,
              content: photo.description,
              field: 'categoryPhotoDescription',
              categoryId: cat.id,
              photoId: photo.id,
            });
          }
        });
      });

      if (conclusion?.trim()) {
        contents.push({
          id: `conclusion`,
          content: conclusion,
          field: 'conclusion',
        });
      }
    }

    return contents;
  }, [tab, inspecaoStore, homeStore]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTranslationComplete(false);
      setError(null);
      setTranslationProgress({ current: 0, total: 0 });
    }
  }, [open]);

  // Get current text count for display
  const currentTextCount = getTextareaContents().length;

  const handleTranslate = async () => {
    if (sourceLang === targetLang) return;

    // Get fresh content at translation time
    const textareaContents = getTextareaContents();

    if (textareaContents.length === 0) {
      // Even with no dynamic texts, change the static language
      setLanguage(targetLang);
      onOpenChange(false);
      return;
    }

    setIsTranslating(true);
    setError(null);
    setTranslationProgress({ current: 0, total: textareaContents.length });

    try {
      const textsToTranslate = textareaContents.map(item => item.content);

      console.log('[TranslateDialog] Translating texts:', textsToTranslate);

      setTranslationProgress({ current: 1, total: textareaContents.length });

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate,
          sourceLang,
          targetLang,
          sourceLangName: LANGUAGE_NAMES[sourceLang],
          targetLangName: LANGUAGE_NAMES[targetLang],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Translation failed');
      }

      const translations: string[] = data.translations || textsToTranslate;

      console.log('[TranslateDialog] Got translations:', translations);

      setTranslationProgress({ current: textareaContents.length, total: textareaContents.length });

      // Apply translations back to the store
      if (tab === 'inspecao') {
        textareaContents.forEach((item, idx) => {
          const translatedText = translations[idx];

          if (item.field === 'inspectionDescricao') {
            inspecaoStore.updateInspection({ descricao: translatedText });
          } else if (item.field === 'photoDescription' && item.photoId) {
            inspecaoStore.updatePhoto(item.photoId, { description: translatedText });
          } else if (item.field === 'photoPartName' && item.photoId) {
            inspecaoStore.updatePhoto(item.photoId, { partName: translatedText });
          } else if (item.field === 'conclusion') {
            inspecaoStore.setConclusion(translatedText);
          }
        });
      } else {
        textareaContents.forEach((item, idx) => {
          const translatedText = translations[idx];

          if (item.field === 'inspectionDescricao') {
            homeStore.updateInspection({ descricao: translatedText });
          } else if (item.field === 'categoryPhotoDescription' && item.categoryId && item.photoId) {
            homeStore.updatePhotoInCategory(item.categoryId, item.photoId, { description: translatedText });
          } else if (item.field === 'conclusion') {
            homeStore.setConclusion(translatedText);
          }
        });
      }

      // Change the static text language to match target language
      setLanguage(targetLang);

      setTranslationComplete(true);

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);

    } catch (err) {
      console.error('[TranslateDialog] Translation error:', err);
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

  const languages: Language[] = ['pt', 'en', 'ja', 'zh'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-orange-500" />
            Traduzir Textos
          </DialogTitle>
          <DialogDescription>
            Traduza todos os textos dinâmicos para outro idioma
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="py-8 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-red-600">Erro na Tradução</h3>
            <p className="text-gray-500 mb-4">{error}</p>
            <Button
              variant="outline"
              onClick={() => setError(null)}
            >
              Tentar Novamente
            </Button>
          </div>
        ) : translationComplete ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Tradução Concluída!</h3>
            <p className="text-gray-500">
              {currentTextCount} texto(s) traduzido(s) para {LANGUAGE_NAMES[targetLang]}
            </p>
          </div>
        ) : isTranslating ? (
          <div className="py-8 text-center">
            <Loader2 className="h-16 w-16 text-orange-500 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold mb-2">Traduzindo...</h3>
            <p className="text-gray-500 mb-4">
              {translationProgress.current} de {translationProgress.total} textos
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(translationProgress.current / translationProgress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Text count */}
            <div className="my-4 text-center">
              <span className="text-3xl font-bold text-orange-500">{currentTextCount}</span>
              <p className="text-gray-500">campo(s) com texto encontrado(s)</p>
            </div>

            {/* Language Selection */}
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">De:</label>
                <Select value={sourceLang} onValueChange={(v) => setSourceLang(v as Language)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {LANGUAGE_FLAGS[lang]} {LANGUAGE_NAMES[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 mt-6" />

              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Para:</label>
                <Select value={targetLang} onValueChange={(v) => setTargetLang(v as Language)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang} disabled={lang === sourceLang}>
                        {LANGUAGE_FLAGS[lang]} {LANGUAGE_NAMES[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Swap Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full mb-4"
              onClick={() => {
                const temp = sourceLang;
                setSourceLang(targetLang);
                setTargetLang(temp);
              }}
            >
              ↔ Inverter idiomas
            </Button>

            {/* Translate Button */}
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600"
              onClick={handleTranslate}
              disabled={sourceLang === targetLang}
            >
              <Languages className="h-4 w-4 mr-2" />
              Traduzir
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
