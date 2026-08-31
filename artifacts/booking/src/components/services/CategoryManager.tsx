import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useServiceCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useReorderServiceCategories } from "@/hooks/use-addons";
import { useSelectedStore } from "@/hooks/use-store";
import { Plus, Pencil, Save, X, Trash2, Camera, Search, GripVertical, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Pastel palette for calendar cards ─────────────────────────────────────────
// No red, pink, or grey — those are reserved for cancelled / no-show / completed.
export const CATEGORY_PALETTE: Record<string, { label: string; bg: string; border: string; swatch: string }> = {
  lavender:   { label: "Lavender",   bg: "#ede9fe", border: "#c4b5fd", swatch: "#c4b5fd" },
  periwinkle: { label: "Periwinkle", bg: "#e0e7ff", border: "#a5b4fc", swatch: "#a5b4fc" },
  sky:        { label: "Sky",        bg: "#dbeafe", border: "#93c5fd", swatch: "#93c5fd" },
  teal:       { label: "Teal",       bg: "#ccfbf1", border: "#5eead4", swatch: "#5eead4" },
  mint:       { label: "Mint",       bg: "#d1fae5", border: "#6ee7b7", swatch: "#6ee7b7" },
  lemon:      { label: "Lemon",      bg: "#fefce8", border: "#fef08a", swatch: "#fde047" },
  peach:      { label: "Peach",      bg: "#ffedd5", border: "#fed7aa", swatch: "#fdba74" },
};

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* "None" option */}
      <button
        type="button"
        title="No colour (use default)"
        onClick={() => onChange(null)}
        className={cn(
          "w-6 h-6 rounded-full border-2 transition-all",
          !value
            ? "border-foreground scale-110 shadow"
            : "border-border hover:border-muted-foreground",
          "bg-white"
        )}
      >
        <span className="sr-only">None</span>
        <div className="w-full h-full rounded-full flex items-center justify-center">
          <div className="w-3 h-[1.5px] bg-muted-foreground rotate-45" />
        </div>
      </button>

      {Object.entries(CATEGORY_PALETTE).map(([key, { label, swatch }]) => (
        <button
          key={key}
          type="button"
          title={label}
          onClick={() => onChange(key)}
          className={cn(
            "w-6 h-6 rounded-full border-2 transition-all",
            value === key
              ? "border-foreground scale-110 shadow"
              : "border-transparent hover:border-muted-foreground/50"
          )}
          style={{ backgroundColor: swatch }}
        >
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function CategoryManager() {
  const { data: categories = [] } = useServiceCategories();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editHidden, setEditHidden] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<string | null>(null);
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { mutate: createCategory, isPending: isCreating } = useCreateCategory();
  const { mutate: updateCategory } = useUpdateCategory();
  const { mutate: deleteCategory } = useDeleteCategory();
  const reorderCategories = useReorderServiceCategories();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();

  const [categoryOrder, setCategoryOrder] = useState<string[] | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Load/save category order from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("categoryOrder");
    if (stored) setCategoryOrder(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (categoryOrder) {
      localStorage.setItem("categoryOrder", JSON.stringify(categoryOrder));
      if (categories && categories.length > 0) {
        const nameToId: Record<string, number> = {};
        categories.forEach((c: any) => { nameToId[c.name] = c.id; });
        const orderedIds = categoryOrder.map((name) => nameToId[name]).filter(Boolean);
        const orderedNames = new Set(categoryOrder);
        const remainingIds = categories
          .filter((c: any) => !orderedNames.has(c.name))
          .map((c: any) => c.id);
        const finalOrderedIds = [...orderedIds, ...remainingIds];
        if (finalOrderedIds.length > 0) {
          reorderCategories.mutate(finalOrderedIds);
        }
      }
    }
  }, [categoryOrder, categories]);

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;
    const currentList = [...categories];
    if (categoryOrder) {
      currentList.sort((a: any, b: any) => {
        const idxA = categoryOrder.indexOf(a.name);
        const idxB = categoryOrder.indexOf(b.name);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    const newList = [...currentList];
    const [removed] = newList.splice(dragItem.current, 1);
    newList.splice(dragOverItem.current, 0, removed);
    setCategoryOrder(newList.map((c: any) => c.name));
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const startEdit = (cat: any) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color ?? null);
    setEditImageUrl(cat.imageUrl || null);
    setEditHidden(cat.hiddenFromPublic || false);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateCategory(
      { id: editingId, name: editName.trim(), imageUrl: editImageUrl || undefined, color: editColor ?? undefined, hiddenFromPublic: editHidden },
      {
        onSuccess: () => {
          toast({ title: "Category updated" });
          setEditingId(null);
          setEditName("");
          setEditColor(null);
          setEditImageUrl(null);
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleDelete = async (id: number) => {
    if (await confirm("Delete this category? Services in this category will keep their current category text.", { destructive: true })) {
      deleteCategory(id, {
        onSuccess: () => toast({ title: "Category deleted" }),
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      });
    }
  };

  const handleCreate = () => {
    if (!newCategoryName.trim()) return;
    createCategory(
      { name: newCategoryName.trim(), imageUrl: newCategoryImageUrl || undefined, color: newCategoryColor ?? undefined },
      {
        onSuccess: () => {
          toast({ title: "Category created" });
          setNewCategoryName("");
          setNewCategoryColor(null);
          setNewCategoryImageUrl(null);
        },
        onError: () => toast({ title: "Failed to create", variant: "destructive" }),
      }
    );
  };

  const filteredCategories = categories
    .filter((cat: any) => (cat.displayName || cat.name).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a: any, b: any) => {
      if (!categoryOrder) return 0;
      const idxA = categoryOrder.indexOf(a.name);
      const idxB = categoryOrder.indexOf(b.name);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new window.FileReader();
    reader.onloadend = () => {
      if (isEdit) setEditImageUrl(reader.result as string);
      else setNewCategoryImageUrl(reader.result as string);
    };
    reader.onerror = () => toast({ title: "Failed to read image", variant: "destructive" });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* ── Add new category ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2">
            {newCategoryImageUrl && (
              <img src={newCategoryImageUrl} alt="New" className="w-9 h-9 rounded object-cover border" />
            )}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="new-cat-image"
                onChange={(e) => handleFileChange(e, false)}
              />
              <label
                htmlFor="new-cat-image"
                className="flex items-center justify-center w-9 h-9 border rounded cursor-pointer hover:bg-muted"
                title="Upload Image"
              >
                <Camera className="w-4 h-4 text-muted-foreground" />
              </label>
            </div>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="w-[200px]"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              data-testid="input-new-category"
            />
            <Button
              onClick={handleCreate}
              disabled={isCreating || !newCategoryName.trim() || !selectedStore}
              data-testid="button-create-category"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </div>
          {/* Colour picker for new category */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Calendar colour:</span>
            <ColorPicker value={newCategoryColor} onChange={setNewCategoryColor} />
          </div>
        </div>
      </div>

      {/* ── Category table ─────────────────────────────────────────────────── */}
      <div className="rounded-md border">
        <div className="p-4 border-b flex justify-between items-center bg-muted/50">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="ml-4 text-xs text-muted-foreground">Drag row handle to reorder</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-[100px]">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Calendar Colour</TableHead>
              <TableHead className="w-[140px] text-center">Hidden from Public</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                  No categories found.
                </TableCell>
              </TableRow>
            ) : (
              filteredCategories.map((cat: any, idx: number) => (
                <TableRow
                  key={cat.id}
                  className="group"
                  data-testid={`category-item-${cat.id}`}
                  draggable={!searchQuery && !editingId}
                  onDragStart={() => !searchQuery && !editingId && handleDragStart(idx)}
                  onDragEnter={() => !searchQuery && !editingId && handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <TableCell className="cursor-move text-muted-foreground">
                    {!searchQuery && !editingId && <GripVertical className="w-4 h-4" />}
                  </TableCell>

                  {editingId === cat.id ? (
                    <>
                      {/* Image cell */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {editImageUrl && (
                            <img src={editImageUrl} alt="Edit" className="w-9 h-9 border rounded object-cover" />
                          )}
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`edit-cat-image-${cat.id}`}
                              onChange={(e) => handleFileChange(e, true)}
                            />
                            <label
                              htmlFor={`edit-cat-image-${cat.id}`}
                              className="flex items-center justify-center w-8 h-8 border rounded cursor-pointer hover:bg-muted"
                              title="Change Image"
                            >
                              <Camera className="w-4 h-4 text-muted-foreground" />
                            </label>
                          </div>
                        </div>
                      </TableCell>
                      {/* Name cell */}
                      <TableCell>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9"
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          autoFocus
                          data-testid={`input-edit-category-${cat.id}`}
                        />
                      </TableCell>
                      {/* Colour picker cell */}
                      <TableCell>
                        <ColorPicker value={editColor} onChange={setEditColor} />
                      </TableCell>
                      {/* Hidden from public cell (edit mode) */}
                      <TableCell className="text-center">
                        <Switch
                          checked={editHidden}
                          onCheckedChange={setEditHidden}
                          aria-label="Hidden from public"
                        />
                      </TableCell>
                      {/* Actions cell */}
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={saveEdit} data-testid={`button-save-category-${cat.id}`}>
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-cancel-category-${cat.id}`}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      {/* Image cell */}
                      <TableCell>
                        {cat.imageUrl && (
                          <img src={cat.imageUrl} alt={cat.displayName || cat.name} className="w-10 h-10 border rounded object-cover" />
                        )}
                      </TableCell>
                      {/* Name cell */}
                      <TableCell className="font-medium" data-testid={`text-category-name-${cat.id}`}>
                        <div className="flex items-center gap-2">
                          {cat.hiddenFromPublic && <EyeOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          {cat.displayName || cat.name}
                        </div>
                      </TableCell>
                      {/* Colour swatch cell */}
                      <TableCell>
                        {cat.color && CATEGORY_PALETTE[cat.color] ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-4 h-4 rounded-full border"
                              style={{ backgroundColor: CATEGORY_PALETTE[cat.color].swatch }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {CATEGORY_PALETTE[cat.color].label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Hidden from public cell (view mode — toggle immediately) */}
                      <TableCell className="text-center">
                        <Switch
                          checked={cat.hiddenFromPublic || false}
                          onCheckedChange={(val) =>
                            updateCategory(
                              { id: cat.id, hiddenFromPublic: val },
                              {
                                onSuccess: () => toast({ title: val ? "Hidden from public" : "Visible to public" }),
                                onError: () => toast({ title: "Failed to update", variant: "destructive" }),
                              }
                            )
                          }
                          aria-label="Hidden from public"
                        />
                      </TableCell>
                      {/* Actions cell */}
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(cat)} data-testid={`button-edit-category-${cat.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(cat.id)}
                            data-testid={`button-delete-category-${cat.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Available calendar colours</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(CATEGORY_PALETTE).map(([key, { label, swatch, bg }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="w-5 h-5 rounded border"
                style={{ backgroundColor: bg, borderColor: swatch }}
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Red, pink, and grey are reserved for cancelled, no-show, and completed appointments.
        </p>
      </div>
    </div>
  );
}
