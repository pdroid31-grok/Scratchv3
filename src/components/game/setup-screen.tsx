"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, CalendarRange, Gamepad2, Gift, Medal, MinusCircle, PlusCircle, Sun, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/lib/game/store";
import { AuthBar, useGmPrefill } from "@/components/game/auth-bar";
import { ProfileTab } from "@/components/game/profile-tab";
import { Leaderboard } from "@/components/game/leaderboard";
import { StoreTab } from "@/components/game/store-tab";
import { SeasonTab, markSeasonBoardFocus, writeWeekView } from "@/components/game/season-tab";
import { MatchHelpButton, MatchHelpCard, type MatchHelpKind } from "@/components/game/match-help";
import { MatchLobby } from "@/components/game/match-lobby";
import { LiveMatchCard } from "@/components/game/live-match-card";
import { PlayDailyStrip } from "@/components/game/play-daily-strip";
import { PlayWeeklyStrip } from "@/components/game/play-weekly-strip";
import { NewsFeed, NewsStrip } from "@/components/game/news-feed";
import { DailyStartScreen } from "@/components/game/daily-start-screen";
import { WeeklyStartScreen } from "@/components/game/weekly-start-screen";
import {
  clearDailyRankings,
  clearPlayHome,
  clearWeeklyRankings,
  markDailyRankings,
  wantsDailyRankings,
  wantsPlayHome,
  wantsWeeklyRankings,
  type RankTabId,
} from "@/lib/game/rank-tabs";
import type { Leaderboard as Boards } from "@/lib/game/stats";
import { cn } from "@/lib/utils";

export function SetupScreen({
  prefillRoom = "",
  prefillTab,
  prefillBoard,
  boards = null,
  forceLobby = false,
}: {
  prefillRoom?: string;
  prefillTab?: "play" | "rankings" | "profile" | "store" | "season";
  prefillBoard?: RankTabId;
  boards?: Boards | null;
  forceLobby?: boolean;
}) {
  const startGame = useGame((s) => s.startGame);
  const hostOnline = useGame((s) => s.hostOnline);
  const joinOnline = useGame((s) => s.joinOnline);
  const watchOnline = useGame((s) => s.watchOnline);
  const busy = useGame((s) => s.busy);
  const netError = useGame((s) => s.netError);
  const gm = useGmPrefill();
  const [name0, setName0] = useState("");
  const [name1, setName1] = useState("");
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [name0Dirty, setName0Dirty] = useState(false);
  const [hostDirty, setHostDirty] = useState(false);
  const [joinDirty, setJoinDirty] = useState(false);
  const landingPlay = wantsPlayHome();
  const landingDaily = !landingPlay && (wantsDailyRankings() || prefillBoard === "daily");
  const landingWeekly = !landingPlay && (wantsWeeklyRankings() || prefillBoard === "weekly");
  const [tab, setTab] = useState<"play" | "rankings" | "profile" | "store" | "season">(
    landingDaily || landingWeekly ? "rankings" : (prefillTab ?? "play"),
  );
  const [board, setBoard] = useState<RankTabId>(
    landingDaily ? "daily" : landingWeekly ? "weekly" : prefillTab === "rankings" ? (prefillBoard ?? "daily") : "daily",
  );
  const [help, setHelp] = useState<MatchHelpKind | null>(null);
  const [lobbyOpen, setLobbyOpen] = useState(forceLobby);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const fromNews = useRef(false);
  const [hostCard, setHostCard] = useState(false);
  const [phoneCard, setPhoneCard] = useState(false);
  const [joiningLive, setJoiningLive] = useState<string | null>(null);

  useEffect(() => {
    if (forceLobby) setLobbyOpen(true);
  }, [forceLobby]);

  useEffect(() => {
    if (wantsPlayHome()) {
      clearPlayHome();
      setTab("play");
      return;
    }
    if (wantsDailyRankings() || prefillBoard === "daily") {
      setTab("rankings");
      setBoard("daily");
      return;
    }
    if (wantsWeeklyRankings() || prefillBoard === "weekly") {
      setTab("rankings");
      setBoard("weekly");
      return;
    }
    if (prefillTab) setTab(prefillTab);
    if (prefillTab === "rankings") setBoard(prefillBoard ?? "daily");
  }, [prefillTab, prefillBoard]);

  useEffect(() => {
    let locked = false;
    try {
      locked = Boolean(sessionStorage.getItem("darkness-join-lock"));
    } catch {
      /* ignore */
    }
    if (locked) {
      setJoinCode("");
      return;
    }
    if (prefillRoom) setJoinCode(prefillRoom.toUpperCase());
    else setJoinCode("");
  }, [prefillRoom]);

  useEffect(() => {
    if (!gm) return;
    if (!hostDirty) setHostName(gm);
    if (!joinDirty) setJoinName(gm);
    if (!name0Dirty) setName0(gm);
  }, [gm, hostDirty, joinDirty, name0Dirty]);

  if (tab === "play" && weeklyOpen) {
    return (
      <WeeklyStartScreen
        onClose={() => setWeeklyOpen(false)}
        onSeeResults={(userId) => {
          writeWeekView("board");
          markSeasonBoardFocus(userId ?? "");
          setWeeklyOpen(false);
          setTab("season");
        }}
      />
    );
  }

  if (tab === "play" && dailyOpen) {
    return (
      <DailyStartScreen
        onClose={() => setDailyOpen(false)}
        onSeeResults={() => {
          markDailyRankings();
          setDailyOpen(false);
          setTab("rankings");
          setBoard("daily");
        }}
      />
    );
  }

  return (
    <main className="relative mx-auto flex min-h-full w-full min-w-0 max-w-lg flex-1 flex-col overflow-x-hidden px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg sm:text-6xl">
            Darkness
          </h1>
        </div>
        <AuthBar
          className="shrink-0"
          onProfile={() => {
            clearDailyRankings();
            clearWeeklyRankings();
            clearPlayHome();
            setNewsOpen(false);
            setTab("profile");
          }}
        />
      </header>

      <div className="mt-6 grid w-full min-w-0 grid-cols-4 gap-1 rounded-lg bg-surface/90 p-1 shadow-[var(--shadow-border)]">
        {(
          [
            { id: "play" as const, label: "Play", Icon: Gamepad2 },
            { id: "season" as const, label: "Season", Icon: Medal },
            { id: "rankings" as const, label: "Rankings", Icon: Trophy },
            { id: "store" as const, label: "Store", Icon: Gift },
          ] as const
        ).map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              setNewsOpen(false);
              if (row.id === "rankings") {
                setBoard(landingDaily ? "daily" : landingWeekly ? "weekly" : "daily");
                setTab("rankings");
                return;
              }
              clearDailyRankings();
              clearWeeklyRankings();
              clearPlayHome();
              setTab(row.id);
            }}
            className={cn(
              "flex h-12 flex-col items-center justify-center gap-0.5 rounded-md font-display text-[10px] font-semibold uppercase tracking-wider sm:text-xs",
              tab === row.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            <row.Icon className="size-4" strokeWidth={2} />
            {row.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? <ProfileTab /> : null}
      {tab === "season" ? <SeasonTab /> : null}
      {tab === "rankings" ? <Leaderboard board={board} initial={boards} /> : null}
      {tab === "store" ? (
        <StoreTab
          onProfile={() => {
            clearDailyRankings();
            clearWeeklyRankings();
            clearPlayHome();
            setNewsOpen(false);
            setTab("profile");
          }}
        />
      ) : null}

      {tab === "play" ? (
        <>
      {netError && !lobbyOpen && !newsOpen ? (
        <p className="mt-4 rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{netError}</p>
      ) : null}

      {newsOpen ? (
        <NewsFeed
          onPlay={() => {
            fromNews.current = true;
            setNewsOpen(false);
          }}
        />
      ) : lobbyOpen ? (
        <MatchLobby
          name={hostName}
          onName={(value) => {
            setHostDirty(true);
            setHostName(value);
          }}
          onClose={() => setLobbyOpen(false)}
        />
      ) : (
      <>
      <NewsStrip
        onOpen={() => {
          fromNews.current = false;
          setNewsOpen(true);
        }}
      />
      <section className={cn("mt-3 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]", fromNews.current && "news-slide-back")}>
        <form
          className="grid gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="grid gap-1">
            <Button
              type="button"
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              onClick={() => setLobbyOpen(true)}
            >
              <Users className="size-4" />
              Public Lobby
            </Button>
            <LiveMatchCard
              busy={busy}
              joining={joiningLive}
              onHost={() => void hostOnline(hostName, "elimination", true)}
              onJoin={(code) => {
                setJoiningLive(code);
                void joinOnline(code, hostName || joinName).finally(() => setJoiningLive(null));
              }}
              onWatch={(code) => void watchOnline(code)}
            />
          </div>
          <div className="grid gap-1">
            <Button
              type="button"
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              onClick={() => setDailyOpen(true)}
            >
              <Sun className="size-4" />
              Daily Match
            </Button>
            <PlayDailyStrip
              onOpen={() => {
                setTab("rankings");
                setBoard("daily");
              }}
            />
          </div>
          <div className="grid gap-1">
            <Button
              type="button"
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              onClick={() => setWeeklyOpen(true)}
            >
              <CalendarRange className="size-4" />
              Weekly Match
            </Button>
            <PlayWeeklyStrip
              onOpen={() => {
                writeWeekView("list");
                setTab("season");
              }}
            />
          </div>
        </form>

        <div className="mt-5 grid gap-3 border-t border-border pt-5">
          <PlayCardToggle
            label="Private Match"
            open={hostCard}
            onToggle={() => setHostCard((v) => !v)}
          />
          {hostCard ? (
            <>
              <div className="grid gap-3">
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-muted">Host</p>
                <div className="grid gap-2">
                  <Label htmlFor="host-name" className="text-p1">
                    Your name
                  </Label>
                  <Input
                    id="host-name"
                    name="host-name"
                    autoComplete="nickname"
                    maxLength={16}
                    value={hostName}
                    onChange={(e) => {
                      setHostDirty(true);
                      setHostName(e.target.value);
                    }}
                  />
                </div>
                <div className="grid gap-1">
                  <MatchHelpButton kind="elimination" onOpen={setHelp} />
                  <Button
                    type="button"
                    size="lg"
                    className="w-full font-display uppercase tracking-wider"
                    disabled={busy}
                    onClick={() => void hostOnline(hostName, "elimination")}
                  >
                    <Calendar className="size-4" />
                    Elimination
                  </Button>
                </div>
              </div>
              <form
                className="grid gap-3 border-t border-border pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void joinOnline(joinCode, joinName);
                }}
              >
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-muted">Join</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="join-code">Code</Label>
                    <Input
                      id="join-code"
                      name="join-code"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="join-name" className="text-p2">
                      Your name
                    </Label>
                    <Input
                      id="join-name"
                      name="join-name"
                      autoComplete="nickname"
                      maxLength={16}
                      value={joinName}
                      onChange={(e) => {
                        setJoinDirty(true);
                        setJoinName(e.target.value);
                      }}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="w-full font-display uppercase tracking-wider"
                  disabled={busy || joinCode.trim().length < 4}
                >
                  Join match
                </Button>
              </form>
            </>
          ) : null}

          <div className="border-t border-border pt-3">
            <PlayCardToggle
              label="Play on one phone"
              open={phoneCard}
              onToggle={() => setPhoneCard((v) => !v)}
            />
            {phoneCard ? (
              <form
                className="mt-3 grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <p className="text-sm text-muted">Pass the device for fun, no stats kept or dollars earned</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="gm1" className="text-p1">
                      Home GM
                    </Label>
                    <Input
                      id="gm1"
                      name="gm1"
                      autoComplete="nickname"
                      maxLength={16}
                      value={name0}
                      onChange={(e) => {
                        setName0Dirty(true);
                        setName0(e.target.value);
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gm2" className="text-p2">
                      Away GM
                    </Label>
                    <Input
                      id="gm2"
                      name="gm2"
                      autoComplete="nickname"
                      maxLength={16}
                      value={name1}
                      onChange={(e) => setName1(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <MatchHelpButton kind="elimination" onOpen={setHelp} />
                  <Button
                    type="button"
                    size="lg"
                    className="w-full font-display uppercase tracking-wider"
                    onClick={() => startGame(name0, name1, "elimination")}
                  >
                    <Calendar className="size-4" />
                    Elimination
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </section>
      </>
      )}

        </>
      ) : null}
      {help ? <MatchHelpCard kind={help} onClose={() => setHelp(null)} /> : null}
    </main>
  );
}

function PlayCardToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 font-display text-lg font-semibold uppercase tracking-wide text-fg">{label}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? `Hide ${label}` : `Show ${label}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-surface-2"
        onClick={onToggle}
      >
        {open ? <MinusCircle className="size-7" /> : <PlusCircle className="size-7" />}
      </button>
    </div>
  );
}
