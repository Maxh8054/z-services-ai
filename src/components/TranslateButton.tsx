'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';
import { TranslateDialog } from '@/components/TranslateDialog';

interface TranslateButtonProps {
  tab: 'home' | 'inspecao';
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function TranslateButton({ tab }: TranslateButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        size="icon"
        className="rounded-full bg-teal-600 hover:bg-teal-700"
        onClick={() => setShowDialog(true)}
        title="Traduzir textos"
      >
        <Languages className="h-5 w-5" />
      </Button>

      <TranslateDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        tab={tab}
      />
    </>
  );
}
