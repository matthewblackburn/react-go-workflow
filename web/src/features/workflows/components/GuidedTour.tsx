import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  type ArrowRenderProps,
  type EventData,
  Joyride,
  type Placement,
  STATUS,
  type Step,
  type TooltipRenderProps,
} from 'react-joyride';
import { Button } from '@/components/ui/button';

const TOUR_KEY = 'workflow-builder-tour-completed';

const steps: Step[] = [
  {
    target: 'body',
    content:
      "Welcome to the Workflow Builder! Let's take a quick tour to show you how to create your first workflow.",
    placement: 'center',
    skipBeacon: true,
    title: 'Welcome!',
  },
  {
    target: '[data-tour="step-palette"]',
    content:
      'This is your toolbox. It contains all the building blocks you can use — from API calls to conditions and loops. Search or browse by category.',
    placement: 'right',
    skipBeacon: true,
    title: 'Step Palette',
  },
  {
    target: '[data-tour="step-palette-item"]',
    content:
      'To add a step, grab one and drag it onto the canvas. Each step does something specific — hover over them to learn more.',
    placement: 'right',
    skipBeacon: true,
    skipScroll: true,
    title: 'Drag to Add',
  },
  {
    target: '[data-tour="canvas"]',
    content:
      "This is your canvas. Drop steps here, then connect them by dragging from one step's bottom handle to another's top handle. The connections show the order things happen.",
    placement: 'center',
    skipBeacon: true,
    title: 'Your Canvas',
  },
  {
    target: '[data-tour="toolbar-save"]',
    content:
      "Don't forget to save your work! Your workflow is saved to the server so you can come back to it anytime.",
    placement: 'bottom',
    skipBeacon: true,
    title: 'Save',
  },
  {
    target: '[data-tour="toolbar-run"]',
    content:
      "When you're ready, hit Run to execute your workflow. You'll see each step light up in real-time — green for success, red if something goes wrong.",
    placement: 'bottom',
    skipBeacon: true,
    title: 'Run It',
  },
  {
    target: '[data-tour="toolbar-note"]',
    content:
      'Add sticky notes to document your workflow. Great for explaining what each section does — especially helpful for your team.',
    placement: 'bottom',
    skipBeacon: true,
    title: 'Notes',
  },
];

function getArrowTransform(placement: Placement): string {
  if (placement.startsWith('top')) return 'rotate(180deg) translateY(-4px)';
  if (placement.startsWith('right')) return 'rotate(-90deg) translateY(4px)';
  if (placement.startsWith('left')) return 'rotate(90deg) translateY(4px)';
  return 'translateY(-4px)'; // bottom
}

function TourArrow({ placement }: ArrowRenderProps) {
  return (
    <svg
      width="16"
      height="8"
      viewBox="0 0 16 8"
      role="presentation"
      style={{ display: 'block', position: 'relative', transform: getArrowTransform(placement) }}
    >
      <path d="M0 8 L8 0 L16 8" className="fill-card stroke-border" strokeWidth="1" />
    </svg>
  );
}

function TourTooltip({
  continuous,
  index,
  step,
  size,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="w-[340px] rounded-xl border bg-card text-card-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
    >
      <div className="p-5">
        {step.title && (
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{step.title as string}</h3>
          </div>
        )}
        <p className="text-sm text-muted-foreground leading-relaxed">{step.content as string}</p>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            {...skipProps}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
          <span className="text-xs text-muted-foreground/50">
            {index + 1} / {size}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button {...backProps} variant="ghost" size="sm" className="h-8 text-xs">
              <ArrowLeft className="mr-1 h-3 w-3" />
              Back
            </Button>
          )}
          {continuous && (
            <Button {...primaryProps} size="sm" className="h-8 text-xs">
              {isLastStep ? 'Finish' : 'Next'}
              {!isLastStep && <ArrowRight className="ml-1 h-3 w-3" />}
            </Button>
          )}
          {!continuous && (
            <Button {...closeProps} size="sm" className="h-8 text-xs">
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GuidedTour() {
  const [run, setRun] = useState(() => {
    return !localStorage.getItem(TOUR_KEY);
  });

  const handleEvent = (data: EventData) => {
    const { status, index } = data;

    // When entering the "Drag to Add" step, scroll the palette to the top
    if (index === 2) {
      setTimeout(() => {
        const viewport = document.querySelector(
          '[data-tour="step-palette"] [data-radix-scroll-area-viewport]',
        );
        if (viewport) {
          viewport.scrollTop = 0;
        }
      }, 100);
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(TOUR_KEY, 'true');
      setRun(false);
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      tooltipComponent={TourTooltip}
      arrowComponent={TourArrow}
    />
  );
}
