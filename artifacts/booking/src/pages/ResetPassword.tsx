import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MarketingLayout from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <MarketingLayout hideNavActions>
      <div className="flex-1 flex items-center justify-center bg-background p-4 py-16">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <h3 className="font-semibold text-lg">Invalid reset link</h3>
              <p className="text-muted-foreground text-sm">
                This link is missing a reset token. Please request a new one.
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request new link</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      </MarketingLayout>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/auth"), 3000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingLayout hideNavActions>
    <div className="flex-1 flex items-center justify-center bg-background p-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Link to="/auth" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm text-muted-foreground">Back to login</span>
          </div>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>
            Choose a strong password — at least 6 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h3 className="font-semibold text-lg">Password updated!</h3>
              <p className="text-muted-foreground text-sm">
                Redirecting you to login in a moment...
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Go to login now</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
    </MarketingLayout>
  );
}
