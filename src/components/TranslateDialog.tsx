'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Languages, ArrowRight, CheckCircle } from 'lucide-react';
import { useTranslationStore } from '@/store/translationStore';
import { useReportStore } from '@/store/reportStore';
import { useHomeReportStore } from '@/store/homeReportStore';
import { LANGUAGE_NAMES, LANGUAGE_FLAGS, type Language } from '@/lib/translations';

interface TextareaContent {
  id: string;
  content: string;
  field: string;
  categoryId?: string;
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
  const [textareaContents, setTextareaContents] = useState<TextareaContent[]>([]);

  const { setLanguage } = useTranslationStore();
  const inspecaoStore = useReportStore();
  const homeStore = useHomeReportStore();

  // Detect all textareas content when dialog opens
  useEffect(() => {
    if (open) {
      setTranslationComplete(false);
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
            });
          }
          if (photo.partName?.trim()) {
            contents.push({
              id: `photo-${photo.id}-part`,
              content: photo.partName,
              field: 'photoPartName',
              categoryId: photo.id,
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

      setTextareaContents(contents);
    }
  }, [open, tab]);

  const handleTranslate = async () => {
    if (sourceLang === targetLang) return;
    if (textareaContents.length === 0) {
      // Even with no dynamic texts, change the static language
      setLanguage(targetLang);
      onOpenChange(false);
      return;
    }

    setIsTranslating(true);
    setTranslationProgress({ current: 0, total: textareaContents.length });

    try {
      const textsToTranslate = textareaContents.map(item => item.content);

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
          batch: true,
        }),
      });

      const data = await response.json();
      const translations: string[] = data.translations || textsToTranslate;

      setTranslationProgress({ current: textareaContents.length, total: textareaContents.length });

      // Apply translations back to the store
      if (tab === 'inspecao') {
        textareaContents.forEach((item, idx) => {
          const translatedText = translations[idx];

          if (item.field === 'inspectionDescricao') {
            inspecaoStore.updateInspection({ descricao: translatedText });
          } else if (item.field === 'photoDescription' && item.categoryId) {
            inspecaoStore.updatePhoto(item.categoryId, { description: translatedText });
          } else if (item.field === 'photoPartName' && item.categoryId) {
            inspecaoStore.updatePhoto(item.categoryId, { partName: translatedText });
          } else if (item.field === 'conclusion') {
            inspecaoStore.setConclusion(translatedText);
          }
        });
      } else {
        textareaContents.forEach((item, idx) => {
          const translatedText = translations[idx];

          if (item.field === 'inspectionDescricao') {
            homeStore.updateInspection({ descricao: translatedText });
          } else if (item.field === 'categoryPhotoDescription' && item.categoryId) {
            const photoId = item.id.split('-').pop();
            if (photoId) {
              homeStore.updatePhotoInCategory(item.categoryId, photoId, { description: translatedText });
            }
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

    } catch (error) {
      console.error('Translation error:', error);
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
        </DialogHeader>

        {translationComplete ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Tradução Concluída!</h3>
            <p className="text-gray-500">
              {textareaContents.length} texto(s) traduzido(s) para {LANGUAGE_NAMES[targetLang]}
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
              <span className="text-3xl font-bold text-orange-500">{textareaContents.length}</span>
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
