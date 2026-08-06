import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { Plus, Trash2, Package, Search, Pencil, Save, X, MoreHorizontal } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { confirm } from "@/lib/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProductsList() {
  const { data: products, isLoading } = useProducts();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editedRows, setEditedRows] = useState<Record<number, Partial<Product>>>({});
  
  const { mutate: updateProduct } = useUpdateProduct();
  const { mutate: deleteProduct } = useDeleteProduct();
  const { toast } = useToast();

  const filtered = (products || []).filter((p: Product) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ((p.brand || "") as string).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFieldChange = (id: number, field: string, value: string | number) => {
    setEditedRows(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveAllChanges = () => {
    const entries = Object.entries(editedRows);
    if (entries.length === 0) {
      setEditMode(false);
      return;
    }

    let completed = 0;
    entries.forEach(([idStr, changes]) => {
      const id = Number(idStr);
      updateProduct({ id, ...changes } as any, {
        onSuccess: () => {
          completed++;
          if (completed === entries.length) {
            toast({ title: "All changes saved" });
            setEditedRows({});
            setEditMode(false);
          }
        },
        onError: () => {
          toast({ title: "Failed to save some changes", variant: "destructive" });
        },
      });
    });
  };

  const cancelEdit = () => {
    setEditedRows({});
    setEditMode(false);
  };

  const getFieldValue = (product: Product, field: keyof Product) => {
    if (editedRows[product.id] && field in editedRows[product.id]!) {
      return (editedRows[product.id] as any)[field];
    }
    return product[field];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[220px]"
              data-testid="input-search-products"
            />
          </div>
          <Button
            variant={editMode ? "default" : "outline"}
            onClick={() => editMode ? saveAllChanges() : setEditMode(true)}
            data-testid="button-product-edit-mode"
          >
            {editMode ? (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All
              </>
            ) : (
              <>
                <Pencil className="w-4 h-4 mr-2" />
                Edit Mode
              </>
            )}
          </Button>
          {editMode && (
            <Button variant="ghost" onClick={cancelEdit} data-testid="button-product-cancel-edit">
              <X className="w-4 h-4" />
            </Button>
          )}
          <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <SheetTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" data-testid="button-add-product">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[540px] !max-w-[540px] sm:max-w-[540px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add New Product</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <ProductForm onSuccess={() => setIsCreateOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={editProductId !== null} onOpenChange={(open) => !open && setEditProductId(null)}>
            <SheetContent side="right" className="w-full sm:w-[540px] !max-w-[540px] sm:max-w-[540px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Edit Product</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                {editProductId && (
                  <ProductForm 
                    onSuccess={() => setEditProductId(null)} 
                    initialData={products?.find((p: Product) => p.id === editProductId)}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="products-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">ID</TableHead>
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead className="min-w-[150px]">Brand</TableHead>
                <TableHead className="text-right w-[100px]">Price</TableHead>
                <TableHead className="text-right w-[100px]">Stock</TableHead>
                <TableHead className="text-right w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    {searchQuery ? "No products match your search." : "No products added yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((product: Product) => (
                  <TableRow
                    key={product.id}
                    className="group"
                    data-testid={`row-product-${product.id}`}
                  >
                    <TableCell className="text-muted-foreground font-mono text-xs">{product.id}</TableCell>
                    <TableCell>
                      <span className="font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{product.brand || "-"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {editMode ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={String(getFieldValue(product, "price"))}
                          onChange={(e) => handleFieldChange(product.id, "price", e.target.value)}
                          className="h-8 w-24 ml-auto"
                          data-testid={`input-product-price-${product.id}`}
                        />
                      ) : (
                        <span className="font-semibold text-green-700">${Number(product.price).toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editMode ? (
                        <Input
                          type="number"
                          value={String(getFieldValue(product, "stock"))}
                          onChange={(e) => handleFieldChange(product.id, "stock", Number(e.target.value))}
                          className="h-8 w-20 ml-auto"
                          data-testid={`input-product-stock-${product.id}`}
                        />
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          (product.stock || 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {product.stock}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${product.id}`}>
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setEditProductId(product.id)} data-testid={`action-edit-${product.id}`}>
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={async () => {
                              if (await confirm("Delete this product?", { destructive: true })) deleteProduct(product.id);
                            }} 
                            className="text-destructive"
                            data-testid={`action-delete-${product.id}`}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="bg-muted/50 border-t px-4 py-2 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
            {editMode && Object.keys(editedRows).length > 0 && (
              <span className="text-xs text-primary font-medium">{Object.keys(editedRows).length} modified</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductForm({ onSuccess, initialData }: { onSuccess: () => void; initialData?: Product }) {
  const { mutate: createProduct, isPending: isCreating } = useCreateProduct();
  const { mutate: updateProduct, isPending: isUpdating } = useUpdateProduct();
  const { toast } = useToast();
  
  const formSchema = insertProductSchema.extend({
    price: z.coerce.number().min(0),
    stock: z.coerce.number().min(0),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: initialData ? {
      name: initialData.name,
      brand: initialData.brand || "",
      price: Number(initialData.price),
      stock: initialData.stock ?? 0,
    } : undefined
  });

  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name,
        brand: initialData.brand || "",
        price: Number(initialData.price),
        stock: initialData.stock ?? 0,
      });
    }
  }, [initialData, reset]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (initialData) {
      updateProduct({ id: initialData.id, ...data } as any, {
        onSuccess: () => {
          toast({ title: "Product updated" });
          onSuccess();
        },
      });
    } else {
      createProduct(data as any, {
        onSuccess: () => {
          toast({ title: "Product created" });
          onSuccess();
        },
      });
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Product Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Moroccan Oil" data-testid="input-product-name" />
        {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand">Brand</Label>
        <Input id="brand" {...register("brand")} placeholder="e.g. L'Oreal" data-testid="input-product-brand" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price ($)</Label>
          <Input id="price" type="number" step="0.01" {...register("price")} placeholder="24.99" data-testid="input-product-price" />
          {errors.price && <span className="text-xs text-destructive">{errors.price.message}</span>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock">Stock Quantity</Label>
          <Input id="stock" type="number" {...register("stock")} placeholder="10" data-testid="input-product-stock" />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90" data-testid="button-submit-product">
          {isPending ? (initialData ? "Updating..." : "Adding...") : (initialData ? "Update Product" : "Add Product")}
        </Button>
      </div>
    </form>
  );
}
