import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { StyleGuard } from "@/components/style-guard";
import { LegalFooter } from "@/components/legal-footer";
import { AppErrorComponent } from "@/lib/error-component";
import appCss from "../styles.css?url";
import appCssInline from "../styles.css?inline";

const APP_NAME = "Darkness";

export const Route = createRootRoute({
  errorComponent: AppErrorComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "application-name", content: APP_NAME },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#0b0d0c" },
      {
        name: "description",
        content: "Two-player NFL auction. Last-decade stars, ratings in the dark, one name at a time.",
      },
    ],
    links: [
      { rel: "manifest", href: "/darkness.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "stylesheet", href: "/critical.css" },
      { rel: "stylesheet", href: "/app.css" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;1,400&family=Barlow+Condensed:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{background:#0b0d0c;color:#e8ebe6;margin:0;min-height:100%}${appCssInline}`,
          }}
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-bg text-fg">
        <PreviewHostBridge />
        <StyleGuard />
        <AuthProvider>
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
          <LegalFooter />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
