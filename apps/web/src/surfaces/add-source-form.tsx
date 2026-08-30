import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSourceRequestSchema, parseYoutubeUrl } from "@aulus/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useCreateSourceMutation } from "../queries/sources";
import { ApiError } from "../lib/api";

/**
 * The add-Source form builds on the same createSourceRequestSchema the Hono
 * API validates against, tightening its url with the shared parseYoutubeUrl —
 * so an obviously-bad link is rejected before it ever hits the network.
 */
const addSourceSchema = createSourceRequestSchema.extend({
  url: createSourceRequestSchema.shape.url
    .min(1, "Paste a YouTube link")
    .refine(
      (value) => {
        try {
          parseYoutubeUrl(value);
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          "That doesn't look like a YouTube video, channel, or playlist link",
      },
    ),
});

type AddSourceValues = z.infer<typeof addSourceSchema>;

export function AddSourceForm({ onAdded }: { onAdded?: () => void }) {
  const mutation = useCreateSourceMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddSourceValues>({
    resolver: zodResolver(addSourceSchema),
    defaultValues: { url: "" },
  });

  const submit = handleSubmit(async ({ url }) => {
    await mutation.mutateAsync(url, {
      onSuccess: () => {
        reset();
        onAdded?.();
      },
    });
  });

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "Could not add that Source"
        : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://youtube.com/watch?v=…  ·  /channel/…  ·  /playlist?list=…"
          aria-label="YouTube URL"
          aria-invalid={errors.url ? true : undefined}
          {...register("url")}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add Source"}
        </Button>
      </div>
      {(errors.url?.message || serverError) && (
        <p className="text-xs text-tone-error" role="alert">
          {errors.url?.message ?? serverError}
        </p>
      )}
    </form>
  );
}
