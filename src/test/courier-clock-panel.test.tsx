import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourierClockPanel } from "@/components/pdv/CourierClockPanel";
import type { CourierTimeEntry } from "@/lib/courier-operations";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/confirm-action", () => ({ confirmAction: vi.fn(async () => true) }));
vi.mock("@/lib/courier-operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/courier-operations")>();
  return { ...actual, currentCourierShift: () => "morning", saoPauloDay: () => "2026-11-19" };
});

const entry: CourierTimeEntry = {
  id: "entry-1",
  courier_id: "courier-1",
  courier_name: "Motoboy Teste",
  shift_date: "2026-11-19",
  shift_code: "morning",
  scheduled_start: "11:00",
  scheduled_end: "14:00",
  entry_at: "2026-11-19T11:23:00Z",
  exit_at: null,
  amount: 60,
};

function renderPanel(entries: CourierTimeEntry[]) {
  rpc.mockImplementation(async (name: string) => {
    if (name === "read_courier_operations")
      return {
        data: { base: null, current_courier_id: "courier-1", locations: [], time_entries: entries },
        error: null,
      };
    return { data: null, error: null };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CourierClockPanel />
    </QueryClientProvider>,
  );
}

describe("ponto simples do turno atual", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("mostra somente a manhã, sem horários fixos, e permite bater a primeira entrada", async () => {
    renderPanel([]);
    const button = await screen.findByRole("button", { name: "Bater ponto" });
    expect(screen.getByText("Turno da manhã")).toBeTruthy();
    expect(screen.queryByText("Turno da noite")).toBeNull();
    expect(screen.queryByText(/11:00|14:00|18:00|22:00/)).toBeNull();
    fireEvent.click(button);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("clock_courier_shift", {
        p_action: "entry",
        p_shift: "morning",
      }),
    );
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("substitui a entrada pelo horário real e mantém a saída disponível", async () => {
    renderPanel([entry]);
    expect(await screen.findByText("08:23")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bater ponto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Registrar saída" })).toBeTruthy();
    expect(screen.queryByText("Turno da noite")).toBeNull();
  });

  it("mostra entrada e saída gravadas sem manter botões após a conclusão", async () => {
    renderPanel([{ ...entry, exit_at: "2026-11-19T17:05:00Z" }]);
    expect(await screen.findByText("08:23")).toBeTruthy();
    expect(screen.getByText("14:05")).toBeTruthy();
    expect(screen.getByText("Turno concluído e horários salvos.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bater ponto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Registrar saída" })).toBeNull();
  });
});
