import { useState } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Request failed");
      setSent(true);
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
          <CardTitle className="text-2xl">Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-4">
                  <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h3 className="font-semibold text-lg">Check your inbox</h3>
              <p className="text-muted-foreground text-sm">
                If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
                The link expires in 1 hour.
              </p>
              <p className="text-xs text-muted-foreground">
                Don't see it? Check your spam folder.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Return to login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send reset link"
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
