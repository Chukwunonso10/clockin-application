import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-950 min-h-screen p-4 sm:p-6 relative">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />
      
      <div className="z-10 w-full max-w-[400px] bg-zinc-905/30 backdrop-blur-md border border-zinc-800/50 p-3 xs:p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <SignIn
          forceRedirectUrl="/dashboard"
          appearance={{
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "#09090b",
              colorInputBackground: "#09090b",
              colorInputText: "#f4f4f5",
              colorText: "#f4f4f5",
              colorTextSecondary: "#a1a1aa",
            },
            elements: {
              card: "bg-transparent shadow-none border-none p-0 max-w-full w-full",
              headerTitle: "text-zinc-100 font-extrabold",
              headerSubtitle: "text-zinc-400",
              socialButtonsBlockButton: "border-zinc-800 hover:bg-zinc-900 text-zinc-100",
              formFieldLabel: "text-zinc-400",
              formFieldInput: "border-zinc-800 bg-zinc-950 text-zinc-100 focus:border-indigo-500",
              footerActionText: "text-zinc-400",
              footerActionLink: "text-indigo-400 hover:text-indigo-300",
              formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl",
            },
          }}
        />
      </div>
    </div>
  );
}
