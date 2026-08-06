import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Trash2, GripVertical, Eye, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

type FieldType = "text" | "textarea" | "select" | "checkbox" | "radio" | "date" | "phone" | "email" | "signature";

type FormField = {
  id?: number;
  label: string;
  fieldType: FieldType;
  options?: string;
  required: boolean;
  sortOrder: number;
};

type IntakeForm = {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  requireBeforeBooking: boolean;
  createdAt: string;
  fields?: FormField[];
};

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text / Paragraph" },
  { value: "email", label: "Email Address" },
  { value: "phone", label: "Phone Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown Select" },
  { value: "radio", label: "Multiple Choice" },
  { value: "checkbox", label: "Checkbox / Agreement" },
  { value: "signature", label: "Signature" },
];

export default function IntakeForms() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingForm, setEditingForm] = useState<IntakeForm | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [requireBeforeBooking, setRequireBeforeBooking] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);

  const { data: forms = [], isLoading } = useQuery<IntakeForm[]>({
    queryKey: ["/api/intake-forms"],
    enabled: !!selectedStore,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/intake-forms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      resetForm();
      toast({ title: "Form created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PUT", `/api/intake-forms/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      resetForm();
      toast({ title: "Form updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/intake-forms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      toast({ title: "Form deleted" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/intake-forms/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] }),
  });

  const resetForm = () => {
    setShowCreate(false);
    setEditingForm(null);
    setFormName("");
    setFormDesc("");
    setRequireBeforeBooking(false);
    setFields([]);
  };

  const openEdit = (form: IntakeForm) => {
    setEditingForm(form);
    setFormName(form.name);
    setFormDesc(form.description || "");
    setRequireBeforeBooking(form.requireBeforeBooking);
    setFields(form.fields || []);
    setShowCreate(true);
  };

  const addField = () => {
    setFields(f => [...f, { label: "", fieldType: "text", required: false, sortOrder: f.length }]);
  };

  const removeField = (i: number) => {
    setFields(f => f.filter((_, idx) => idx !== i).map((f, idx) => ({ ...f, sortOrder: idx })));
  };

  const updateField = (i: number, updates: Partial<FormField>) => {
    setFields(f => f.map((field, idx) => idx === i ? { ...field, ...updates } : field));
  };

  const handleSave = (): void => {
    if (!formName.trim()) {
      toast({ title: "Form name is required", variant: "destructive" });
      return;
    }
    const data = {
      name: formName,
      description: formDesc,
      requireBeforeBooking,
      storeId: selectedStore?.id,
      fields,
    };
    if (editingForm) {
      updateMutation.mutate({ id: editingForm.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ["/api/intake-forms/responses"],
    enabled: !!selectedStore,
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Client Intake Forms</h1>
            <p className="text-muted-foreground">Collect client information before appointments</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Form
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-indigo-500">{forms.length}</div>
              <div className="text-sm text-muted-foreground">Total Forms</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-emerald-500">{forms.filter(f => f.isActive).length}</div>
              <div className="text-sm text-muted-foreground">Active Forms</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-500">{responses.length}</div>
              <div className="text-sm text-muted-foreground">Responses Received</div>
            </CardContent>
          </Card>
        </div>

        {/* Forms List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No intake forms created yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create forms to collect health info, waivers, or client preferences before appointments</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Form
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {forms.map(form => (
              <Card key={form.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{form.name}</span>
                        <Badge variant={form.isActive ? "default" : "secondary"}>
                          {form.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {form.requireBeforeBooking && (
                          <Badge variant="outline" className="text-xs">Required at booking</Badge>
                        )}
                      </div>
                      {form.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{form.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {form.fields?.length || 0} fields · Created {format(new Date(form.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: form.id, isActive: checked })}
                      />
                      <Button size="sm" variant="outline" onClick={() => openEdit(form)}>
                        <Settings className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === form.id ? null : form.id)}>
                        {expandedId === form.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteMutation.mutate(form.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {expandedId === form.id && form.fields && form.fields.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-1.5">
                      {form.fields.map((field, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{FIELD_TYPES.find(t => t.value === field.fieldType)?.label || field.fieldType}</span>
                          <span>{field.label}</span>
                          {field.required && <Badge variant="outline" className="text-xs h-4">Required</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm ? "Edit Form" : "Create Intake Form"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Form Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., New Client Health Intake, Liability Waiver" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description shown to clients" rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={requireBeforeBooking} onCheckedChange={setRequireBeforeBooking} />
              <Label>Require clients to complete this form when booking online</Label>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Form Fields</Label>
                <Button size="sm" variant="outline" onClick={addField}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Field
                </Button>
              </div>
              {fields.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                  <p>No fields yet. Add fields to collect information from clients.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <Input
                            value={field.label}
                            onChange={e => updateField(i, { label: e.target.value })}
                            placeholder="Field label (e.g., Do you have any allergies?)"
                          />
                        </div>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removeField(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select value={field.fieldType} onValueChange={(v: FieldType) => updateField(i, { fieldType: v })}>
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Switch checked={field.required} onCheckedChange={v => updateField(i, { required: v })} />
                          <span className="text-sm text-muted-foreground">Required</span>
                        </div>
                      </div>
                      {(field.fieldType === "select" || field.fieldType === "radio" || field.fieldType === "checkbox") && (
                        <Input
                          value={field.options || ""}
                          onChange={e => updateField(i, { options: e.target.value })}
                          placeholder="Options comma separated (e.g., Yes, No, Not sure)"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingForm ? "Save Changes" : "Create Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
