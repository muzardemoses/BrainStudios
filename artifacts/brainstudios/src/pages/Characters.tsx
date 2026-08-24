import { useState } from "react";
import { useActiveProduction } from "@/components/layout/ProductionContext";
import { useListCharacters, useUpdateCharacter, useToggleCharacterLock, getListCharactersQueryKey } from "@workspace/api-client-react";
import { Loader2, AlertCircle, Users, Lock, Unlock, Edit3, X, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

export default function CharactersPage() {
  const { activeProductionId } = useActiveProduction();
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);

  const { data: characters, isLoading, error } = useListCharacters(activeProductionId || 0, {
    query: {
      enabled: !!activeProductionId,
      queryKey: getListCharactersQueryKey(activeProductionId || 0)
    }
  });

  if (!activeProductionId) return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;
  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error || !characters) return <div className="p-8 text-destructive flex gap-2"><AlertCircle /> Error loading characters.</div>;

  const selectedCharacter = characters.find(c => c.id === selectedCharacterId);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 p-6 border-b border-border bg-card flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
            <Users className="text-primary" /> Cast Board
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Generated personas and locked appearances for production consistency.</p>
        </div>
        <div className="text-sm font-bold text-muted-foreground bg-secondary px-3 py-1 rounded-full border border-border">
          {characters.length} CHARACTERS
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className={`flex-1 p-8 overflow-y-auto ${selectedCharacterId ? 'mr-96' : ''} transition-all duration-300`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {characters.map(char => (
              <CharacterCard 
                key={char.id} 
                character={char} 
                productionId={activeProductionId} 
                isSelected={selectedCharacterId === char.id}
                onClick={() => setSelectedCharacterId(char.id === selectedCharacterId ? null : char.id)}
              />
            ))}
          </div>
        </div>

        {/* Edit Panel Overlay */}
        <div className={`absolute top-0 right-0 w-96 h-full bg-card border-l border-border shadow-2xl transform transition-transform duration-300 z-10 flex flex-col ${selectedCharacter ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedCharacter && (
            <EditPanel 
              character={selectedCharacter} 
              productionId={activeProductionId} 
              onClose={() => setSelectedCharacterId(null)} 
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterCard({ character, productionId, isSelected, onClick }: { character: any, productionId: number, isSelected: boolean, onClick: () => void }) {
  const queryClient = useQueryClient();
  const toggleLock = useToggleCharacterLock({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey(productionId) })
    }
  });

  return (
    <div 
      onClick={onClick}
      className={`group cursor-pointer rounded-xl overflow-hidden border transition-all duration-200 ${
        isSelected 
          ? "border-primary shadow-[0_0_20px_rgba(255,158,0,0.2)] bg-card" 
          : "border-border bg-card hover:border-primary/50 hover-elevate"
      }`}
    >
      <div className="aspect-[3/4] relative bg-secondary">
        {character.portraitUrl ? (
          <img src={character.portraitUrl} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-display text-sm">
            NO PORTRAIT
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLock.mutate({ id: productionId, characterId: character.id, data: { locked: !character.appearanceLocked } });
          }}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md border transition-all ${
            character.appearanceLocked 
              ? "bg-primary/20 border-primary text-primary" 
              : "bg-background/50 border-border text-muted-foreground hover:bg-background"
          }`}
        >
          {character.appearanceLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>

        <div className="absolute bottom-0 left-0 w-full p-4">
          <div className="text-xs font-bold text-primary mb-1 uppercase tracking-widest">{character.role}</div>
          <h3 className="text-xl font-display font-black text-foreground">{character.name}</h3>
        </div>
      </div>
      <div className="p-4 border-t border-border/50 space-y-3 bg-card">
        <div className="text-sm text-muted-foreground line-clamp-2">
          {character.personality}
        </div>
        <div className="flex items-center text-xs font-mono text-muted-foreground gap-2">
          <Edit3 size={12} /> Click to edit profile
        </div>
      </div>
    </div>
  );
}

function EditPanel({ character, productionId, onClose }: { character: any, productionId: number, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { isDirty } } = useForm({
    defaultValues: {
      personality: character.personality,
      motivations: character.motivations,
      appearance: character.appearance,
      visualPrompt: character.visualPrompt
    }
  });

  const updateCharacter = useUpdateCharacter({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey(productionId) });
      }
    }
  });

  const onSubmit = (data: any) => {
    updateCharacter.mutate({ id: productionId, characterId: character.id, data });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between bg-background">
        <h3 className="font-display font-bold text-lg">{character.name}</h3>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded"><X size={20} /></button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-primary uppercase tracking-widest">Personality</label>
          <textarea {...register("personality")} className="w-full bg-input border border-border px-3 py-2 rounded focus:border-primary focus:outline-none text-sm min-h-[100px]" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-primary uppercase tracking-widest">Motivations</label>
          <textarea {...register("motivations")} className="w-full bg-input border border-border px-3 py-2 rounded focus:border-primary focus:outline-none text-sm min-h-[100px]" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-primary uppercase tracking-widest">Appearance (Story)</label>
          <textarea {...register("appearance")} className="w-full bg-input border border-border px-3 py-2 rounded focus:border-primary focus:outline-none text-sm min-h-[80px]" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-primary uppercase tracking-widest flex justify-between">
            Visual Prompt 
            {character.appearanceLocked && <span className="text-destructive">LOCKED</span>}
          </label>
          <textarea 
            {...register("visualPrompt")} 
            disabled={character.appearanceLocked}
            className="w-full bg-input border border-border px-3 py-2 rounded focus:border-primary focus:outline-none text-sm min-h-[100px] font-mono text-muted-foreground disabled:opacity-50" 
          />
        </div>

        <div className="pt-4 border-t border-border">
          <button
            type="submit"
            disabled={!isDirty || updateCharacter.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {updateCharacter.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            SAVE PROFILE
          </button>
        </div>
      </form>
    </div>
  );
}
