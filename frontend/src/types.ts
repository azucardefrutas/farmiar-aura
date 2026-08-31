export type TournamentStatus = 'draft' | 'registration' | 'ready' | 'live' | 'finished' | 'archived'
export type MatchStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'cancelled'
export type MatchType = 'knockout' | 'third_place' | 'bye' | 'exhibition'
export type TournamentFormat = 'single_elimination' | 'free_battles'
export interface TournamentCall { id: string; name: string; status: TournamentStatus; format: TournamentFormat; isCurrent: boolean }
export interface RegistrationCall extends TournamentCall { registered: boolean; durationSeconds: number; auraPerVote: number }
export interface StageSlot { number: number; matchId: string; status: MatchStatus; label: string; contestantA: string; contestantB: string; ready: boolean }
export interface StageSchedule { queue: StageSlot[]; currentMatchId: string | null; nextMatchId: string | null; completed: number; total: number; pendingVoteSeconds: number }

export interface Contestant {
  id: string
  name: string
  program: string
  photoUrl: string | null
  status: string
}

export interface AuraMatch {
  id: string
  roundId: string
  roundNumber: number
  position: number
  matchType: MatchType
  isReplay: boolean
  replayOfId: string | null
  contestantA: Contestant | null
  contestantB: Contestant | null
  status: MatchStatus
  startsAt: string | null
  endsAt: string | null
  durationSeconds: number
  remainingSeconds: number | null
  winnerId: string | null
  votesA: number
  votesB: number
  totalVotes: number
  auraA: number
  auraB: number
}

export interface Round {
  id: string
  number: number
  name: string
  matches: AuraMatch[]
}

export interface TournamentSnapshot {
  stage?: StageSchedule
  serverTime: string
  tournament: {
    id: string
    name: string
    slug: string
    status: TournamentStatus
    updatedAt: string
    format: TournamentFormat
    isCurrent: boolean
    rules: { durationSeconds: number; auraPerVote: number }
  }
  contestants: Contestant[]
  rounds: Round[]
  activeMatch: AuraMatch | null
  viewerVote: { matchId: string; contestantId: string } | null
  placements: Placement[]
  standings: Standing[]
  summary: { contestants: number; votes: number; totalAura: number }
}

export interface Placement { place: number; contestant: Contestant }
export interface Standing { contestant: Contestant; played: number; wins: number; votes: number; aura: number; placement: number | null }

export interface Registration {
  id: string
  nombre: string
  apellidos: string
  edad: number
  carrera: string
  grupo: string
  alias: string | null
  instagram: string | null
  foto_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  creado_en: string
}

export interface AdminSession {
  token: string
  user: { username: string; role: 'admin' | 'collaborator' }
}

export interface AdminDashboard extends TournamentSnapshot {
  calls: TournamentCall[]
  registrations: Registration[]
  auditLogs: Array<{ id: number; action: string; entity_type: string; creado_en: string }>
  collaborators: Array<{ username: string; role: 'admin' | 'collaborator'; active: boolean; createdAt: string }>
}
