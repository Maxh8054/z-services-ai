'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, Check, Sparkles, Globe } from 'lucide-react';

interface SpellError {
  original: string;
  suggestions: string[];
  type: 'spelling' | 'grammar' | 'punctuation';
  message: string;
  position: number;
}

interface TextareaWithSpellCheckProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  rows?: number;
  language?: string; // The UI language - used as preference for corrections
}

const languageFlags: Record<string, string> = {
  pt: '🇧🇷',
  en: '🇺🇸',
  ja: '🇯🇵',
  zh: '🇨🇳',
};

const languageNames: Record<string, string> = {
  pt: 'Português',
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

export function TextareaWithSpellCheck({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  rows = 4,
  language, // UI language - passed to API as preferredLanguage
}: TextareaWithSpellCheckProps) {
  const [errors, setErrors] = useState<SpellError[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<string>('');

  // Debounced spell check
  const checkSpelling = useCallback(async (text: string) => {
    if (!text || text.trim().length < 3) {
      setErrors([]);
      setDetectedLanguage(null);
      return;
    }

    // Skip if already checked this exact text
    if (text === lastCheckedRef.current) {
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch('/api/spell-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          preferredLanguage: language // Pass UI language as preference
        }),
      });
      
      const data = await response.json();
      setErrors(data.errors || []);
      setDetectedLanguage(data.detectedLanguage || null);
      lastCheckedRef.current = text;
    } catch (error) {
      console.error('Spell check error:', error);
    } finally {
      setIsChecking(false);
    }
  }, [language]);

  // Debounce the spell check - only check after user stops typing
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Reset errors when text changes (will be re-checked)
    if (value !== lastCheckedRef.current) {
      // Only clear if significantly different
      if (Math.abs(value.length - lastCheckedRef.current.length) > 5) {
        setErrors([]);
        setDetectedLanguage(null);
      }
    }

    // Debounce: wait 2 seconds after user stops typing
    debounceRef.current = setTimeout(() => {
      if (value && value.trim().length >= 3) {
        checkSpelling(value);
      }
    }, 2000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, checkSpelling]);

  // Apply suggestion
  const applySuggestion = (error: SpellError, suggestion: string) => {
    if (!value) return;
    
    // Find and replace the error with suggestion
    const before = value.substring(0, error.position);
    const after = value.substring(error.position + error.original.length);
    const newValue = before + suggestion + after;
    
    onChange(newValue);
    
    // Remove this error from the list
    setErrors(prev => prev.filter(e => e !== error));
  };

  // Correct all errors with first suggestion
  const correctAll = () => {
    if (!value || errors.length === 0) return;
    
    let newValue = value;
    // Sort errors by position descending to replace from end to start
    const sortedErrors = [...errors].sort((a, b) => b.position - a.position);
    
    for (const error of sortedErrors) {
      if (error.suggestions.length > 0) {
        const before = newValue.substring(0, error.position);
        const after = newValue.substring(error.position + error.original.length);
        newValue = before + error.suggestions[0] + after;
      }
    }
    
    onChange(newValue);
    setErrors([]);
  };

  const hasErrors = errors.length > 0;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'spelling': return 'bg-red-100 text-red-800 border-red-200';
      case 'grammar': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'punctuation': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'spelling': return 'Ortografia';
      case 'grammar': return 'Gramática';
      case 'punctuation': return 'Pontuação';
      default: return type;
    }
  };

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        rows={rows}
      />
      
      {/* Spell Check Button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`absolute top-2 right-2 h-7 w-7 p-0 rounded-full font-bold text-xs transition-all ${
              hasErrors 
                ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' 
                : isChecking 
                  ? 'bg-gray-200 text-gray-500' 
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
            disabled={disabled || isChecking}
          >
            {isChecking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : hasErrors ? (
              <span className="flex items-center gap-0.5">
                Z
                <span className="text-[8px]">{errors.length}</span>
              </span>
            ) : (
              'Z'
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hasErrors ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Check className="h-4 w-4 text-green-500" />
                )}
                <span className="font-medium text-sm">
                  {hasErrors 
                    ? `${errors.length} erro${errors.length > 1 ? 's' : ''} encontrado${errors.length > 1 ? 's' : ''}`
                    : 'Nenhum erro encontrado'
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                {detectedLanguage && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Globe className="h-3 w-3" />
                    {languageFlags[detectedLanguage]} {languageNames[detectedLanguage]}
                  </Badge>
                )}
                {hasErrors && (
                  <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={correctAll}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Corrigir todos
                </Button>
                )}
              </div>
            </div>
          </div>
          
          {hasErrors && (
            <ScrollArea className="max-h-64">
              <div className="p-2 space-y-2">
                {errors.map((error, index) => (
                  <div key={index} className="p-2 rounded-lg border bg-white">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <Badge variant="outline" className={`text-[10px] ${getTypeColor(error.type)}`}>
                          {getTypeLabel(error.type)}
                        </Badge>
                      </div>
                      <span className="text-sm font-medium text-red-600 line-through">
                        {error.original}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-600 mb-2">{error.message}</p>
                    
                    <div className="flex flex-wrap gap-1">
                      {error.suggestions.map((suggestion, sIndex) => (
                        <Button
                          key={sIndex}
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                          onClick={() => applySuggestion(error, suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          
          {!hasErrors && !isChecking && (
            <div className="p-4 text-center text-sm text-gray-500">
              <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
              Texto correto!
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
