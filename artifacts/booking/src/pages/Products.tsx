import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProducts, useCreateProduct, useDeleteProduct } from "@/hooks/use-products";
import { Plus, Trash2, Package, AlertTriangle } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product } from "@shared/schema";
import { z } from "zod";

export default function Products() {
  const { data: products, isLoading } = useProducts();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const { mutate: deleteProduct } = useDeleteProduct();

  const lowStockProducts = (products ?? []).filter(
    (p: Product) =>
      p.stock !== null &&
      p.stock !== undefined &&
      p.stock <= ((p as any).lowStockThreshold ?? 5) &&
      p.stock > 0
  );
  const outOfStockProducts = (products ?? []).filter(
    (p: Product) => p.stock !== null && p.stock !== undefined && p.stock <= 0
  );

  return (
    <>
    <AppLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Inventory</h1>
          <p className="text-muted-foreground">Track retail products and stock.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <CreateProductForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Low-stock alerts */}
      {!isLoading && (lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="mb-6 space-y-2">
          {outOfStockProducts.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{outOfStockProducts.length} product{outOfStockProducts.length !== 1 ? "s" : ""} out of stock:</strong>{" "}
                {outOfStockProducts.map((p: Product) => p.name).join(", ")}
              </span>
            </div>
          )}
          {lowStockProducts.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{lowStockProducts.length} product{lowStockProducts.length !== 1 ? "s" : ""} running low:</strong>{" "}
                {lowStockProducts.map((p: Product) => `${p.name} (${p.stock} left)`).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : products?.map((product: Product) => {
          const threshold = (product as any).lowStockThreshold ?? 5;
          const isOut = (product.stock ?? 0) <= 0;
          const isLow = !isOut && (product.stock ?? 0) <= threshold;

          return (
            <div key={product.id} className="bg-card rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow relative group">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive h-8 w-8"
                onClick={() => setDeleteTarget(product.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              {/* Low-stock badge */}
              {(isOut || isLow) && (
                <div className={`absolute top-2 left-2 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  <AlertTriangle className="w-3 h-3" />
                  {isOut ? "Out of stock" : "Low stock"}
                </div>
              )}

              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-4 text-muted-foreground mt-6">
                <Package className="w-6 h-6" />
              </div>

              <h3 className="font-bold text-lg mb-1">{product.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{product.brand || "Generic"}</p>

              <div className="flex items-center justify-between pt-4 border-t">
                <span className="font-bold text-primary">${Number(product.price).toFixed(2)}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  isOut
                    ? "bg-red-100 text-red-700"
                    : isLow
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}>
                  {product.stock} in stock
                </span>
              </div>
            </div>
          );
        })}
        {!isLoading && products?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            No products in inventory.
          </div>
        )}
      </div>
    </AppLayout>

    <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete product?</AlertDialogTitle>
          <AlertDialogDescription>
            This product will be permanently removed from your inventory.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { if (deleteTarget !== null) { deleteProduct(deleteTarget); setDeleteTarget(null); } }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function CreateProductForm({ onSuccess }: { onSuccess: () => void }) {
  const { mutate, isPending } = useCreateProduct();

  const formSchema = insertProductSchema.extend({
    price: z.coerce.number().min(0),
    purchasePrice: z.coerce.number().min(0).optional(),
    stock: z.coerce.number().min(0),
    lowStockThreshold: z.coerce.number().min(0).optional(),
    upc: z.string().optional(),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: { lowStockThreshold: 5 },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutate(data as any, { onSuccess }))} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Product Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Moroccan Oil" />
        {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input id="brand" {...register("brand")} placeholder="e.g. L'Oreal" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="upc">UPC / Barcode</Label>
          <Input id="upc" {...register("upc")} placeholder="e.g. 012345678901" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="purchasePrice">Purchase / Cost Price ($)</Label>
          <Input id="purchasePrice" type="number" step="0.01" {...register("purchasePrice")} placeholder="12.50" />
          <p className="text-xs text-muted-foreground">What you pay for it.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Sales Price ($)</Label>
          <Input id="price" type="number" step="0.01" {...register("price")} placeholder="24.99" />
          {errors.price && <span className="text-xs text-destructive">{errors.price.message}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock">Quantity in Stock</Label>
          <Input id="stock" type="number" {...register("stock")} placeholder="10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low Stock Alert At</Label>
          <Input id="lowStockThreshold" type="number" min="0" {...register("lowStockThreshold")} placeholder="5" />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add Product"}
        </Button>
      </div>
    </form>
  );
}
