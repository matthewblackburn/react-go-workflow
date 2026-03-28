import { useMutation } from "@tanstack/react-query";
import { Key, Loader2, Send, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { aiApi } from "@/api/ai";
import { secretApi } from "@/api/secrets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type {
    GeneratedEdge,
    GeneratedStep,
    GenerateWorkflowRequest,
    GenerateWorkflowResponse,
} from "@/types/ai";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    questions?: string[];
}

interface AIChatPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentWorkflow?: GenerateWorkflowRequest["current_workflow"];
    onWorkflowGenerated: (
        steps: GeneratedStep[],
        edges: GeneratedEdge[],
        inputSchema?: Record<string, unknown>,
    ) => void;
}

export function AIChatPanel({ open, onOpenChange, currentWorkflow, onWorkflowGenerated }: AIChatPanelProps) {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [missingSecrets, setMissingSecrets] = useState<string[]>([]);
    const [secretValues, setSecretValues] = useState<Record<string, string>>({});
    const [savingSecrets, setSavingSecrets] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        setTimeout(
            () => scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
            50,
        );
    };

    const messagesRef = useRef<ChatMessage[]>([]);
    messagesRef.current = messages;

    const mutation = useMutation({
        mutationFn: ({ message, history }: { message: string; history: { role: string; content: string }[] }) => {
            return aiApi.generateWorkflow({ prompt: message, history, current_workflow: currentWorkflow });
        },
        onSuccess: (data) => {
            if ("type" in data && data.type === "questions") {
                // AI asked clarifying questions
                const questionsText = data.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: questionsText, questions: data.questions },
                ]);
                scrollToBottom();
            } else {
                // AI generated a workflow
                const result = data as GenerateWorkflowResponse;
                setMessages((prev) => [...prev, { role: "assistant", content: result.summary }]);
                onWorkflowGenerated(result.steps, result.edges, result.input_schema);
                toast.success("Workflow generated");

                if (result.missing_secrets && result.missing_secrets.length > 0) {
                    setMissingSecrets(result.missing_secrets);
                    setSecretValues({});
                }
                scrollToBottom();
            }
        },
        onError: (err: any) => {
            const message = err?.message || "Failed to generate workflow. Please try again.";
            toast.error(message);
        },
    });

    const handleSubmit = () => {
        const trimmed = input.trim();
        if (!trimmed || mutation.isPending) return;
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
        setInput("");
        setMissingSecrets([]);
        mutation.mutate({ message: trimmed, history });
        scrollToBottom();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setInput("");
        setMissingSecrets([]);
        setSecretValues({});
    };

    const handleSaveSecrets = async () => {
        setSavingSecrets(true);
        try {
            for (const key of missingSecrets) {
                const value = secretValues[key];
                if (!value) {
                    toast.error(`Please enter a value for ${key}`);
                    setSavingSecrets(false);
                    return;
                }
                await secretApi.create({ key, value });
            }
            toast.success("Secrets saved");
            setMissingSecrets([]);
            setSecretValues({});
        } catch {
            toast.error("Failed to save secrets");
        } finally {
            setSavingSecrets(false);
        }
    };

    const hasConversation = messages.length > 0;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex w-[400px] flex-col gap-0 p-0 sm:w-[440px]" showCloseButton={false}>
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-sm">
                        <Sparkles className="h-4 w-4" />
                        AI Workflow Generator
                    </h3>
                    <div className="flex items-center gap-1">
                        {hasConversation && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleNewChat}>
                                New chat
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
                    {!hasConversation && (
                        <p className="mb-4 text-muted-foreground text-sm">
                            Describe what you want your workflow to do. The AI may ask clarifying questions before
                            generating.
                        </p>
                    )}

                    <div className="space-y-4">
                        {messages.map((msg, i) => (
                            <div
                                // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                key={i}
                                className={`text-sm ${msg.role === "user" ? "ml-8" : "mr-8"}`}
                            >
                                <div
                                    className={`rounded-lg px-3 py-2 ${
                                        msg.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            </div>
                        ))}

                        {mutation.isPending && (
                            <div className="mr-8">
                                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span className="text-muted-foreground">Thinking...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {missingSecrets.length > 0 && (
                        <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                            <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-amber-500" />
                                <p className="font-medium text-sm">Secrets required</p>
                            </div>
                            <p className="text-muted-foreground text-xs">
                                This workflow references secrets that don't exist yet. Enter the values below to create
                                them.
                            </p>
                            <div className="space-y-2">
                                {missingSecrets.map((key) => (
                                    <div key={key} className="space-y-1">
                                        <Label className="text-xs">{key}</Label>
                                        <Input
                                            type="password"
                                            value={secretValues[key] ?? ""}
                                            onChange={(e) =>
                                                setSecretValues((prev) => ({ ...prev, [key]: e.target.value }))
                                            }
                                            placeholder={`Enter value for ${key}`}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                            <Button size="sm" className="w-full" onClick={handleSaveSecrets} disabled={savingSecrets}>
                                {savingSecrets ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Key className="mr-1.5 h-3 w-3" />
                                        Save Secrets
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="shrink-0 border-t p-4">
                    <div className="flex gap-2">
                        <Textarea
                            placeholder={
                                hasConversation ? "Reply to the questions above..." : "Describe your workflow..."
                            }
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={2}
                            className="min-h-0 resize-none text-sm"
                            disabled={mutation.isPending}
                        />
                        <Button
                            size="icon"
                            aria-label="Send"
                            className="h-9.5 w-9.5 shrink-0"
                            onClick={handleSubmit}
                            disabled={!input.trim() || mutation.isPending}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="mt-1.5 text-muted-foreground text-[10px]">
                        <kbd className="rounded border bg-muted px-1">Cmd+Enter</kbd> to send
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
