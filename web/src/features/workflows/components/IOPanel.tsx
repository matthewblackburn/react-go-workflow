import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Workflow } from '@/types/workflow';
import { InputTab, OutputTab } from './WorkflowSettingsSheet';

interface IOPanelProps {
  workflow?: Workflow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IOPanel({ workflow, open, onOpenChange }: IOPanelProps) {
  const queryClient = useQueryClient();

  const handleSaved = useCallback(() => {
    if (workflow) {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
    }
  }, [queryClient, workflow]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[400px] flex-col gap-0 p-0 sm:w-[440px]" showCloseButton={false}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Input / Output</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {workflow ? (
          <Tabs defaultValue="input" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="w-full rounded-none border-b bg-transparent px-4">
              <TabsTrigger value="input" className="flex-1 text-xs">
                Input
              </TabsTrigger>
              <TabsTrigger value="output" className="flex-1 text-xs">
                Output
              </TabsTrigger>
            </TabsList>
            <TabsContent value="input" className="mt-0 flex min-h-0 flex-1 flex-col">
              <InputTab workflow={workflow} onSaved={handleSaved} />
            </TabsContent>
            <TabsContent value="output" className="mt-0 flex min-h-0 flex-1 flex-col">
              <OutputTab workflow={workflow} onSaved={handleSaved} />
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
