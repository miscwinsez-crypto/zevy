import type { LlmClient, VectorClient, VectorResult } from './astra-engine'

export type DebateSpeaker = 'Kairo' | 'Logos' | 'Judge'

export type DebateRole = 'opening' | 'rebuttal' | 'synthesis'

export interface DebateTurn {
  speaker: DebateSpeaker
  role: DebateRole
  content: string
  citations?: VectorResult[]
}

export interface VyraTranscript {
  topic: string
  useVector: boolean
  kairoQuery: string
  logosQuery: string
  kairoSources: VectorResult[]
  logosSources: VectorResult[]
  rounds: DebateTurn[]
  finalVerdict: string
}

export class VyraDebateEngine {
  private readonly llmClient: LlmClient
  private readonly vectorClient: VectorClient
  private readonly kairoModel: string
  private readonly logosModel: string
  private readonly judgeModel: string

  constructor(options: {
    llmClient: LlmClient
    vectorClient: VectorClient
    kairoModel: string
    logosModel: string
    judgeModel: string
  }) {
    this.llmClient = options.llmClient
    this.vectorClient = options.vectorClient
    this.kairoModel = options.kairoModel
    this.logosModel = options.logosModel
    this.judgeModel = options.judgeModel
  }

  private async safeGenerate(model: string, prompt: string, fallback: string): Promise<string> {
    try {
      return await this.llmClient.generate(model, prompt)
    } catch {
      return fallback
    }
  }

  private async generateSearchQuery(
    model: string,
    persona: 'Kairo' | 'Logos',
    topic: string
  ): Promise<string> {
    const style =
      persona === 'Kairo'
        ? 'Propose one bold, high-recall search query about the topic.'
        : 'Propose one cautious, high-precision search query about the topic.'

    const lines = [
      `You are ${persona}, a debater preparing for a debate.`,
      style,
      'Return only the search query string without quotes or extra commentary.',
      `Topic: ${topic}`
    ]

    const prompt = lines.join('\n\n')
    const raw = await this.safeGenerate(model, prompt, topic)
    const firstLine = raw.split('\n')[0].trim()
    const trimmed = firstLine.replace(/^["']|["']$/g, '').trim()
    return trimmed.length > 0 ? trimmed : topic
  }

  private formatSourcesLabelled(label: string, sources: VectorResult[]): string {
    if (sources.length === 0) {
      return `${label}: []`
    }
    return `${label}: ${JSON.stringify(sources, null, 2)}`
  }

  async executeVyraDebate(topic: string, useVector = true): Promise<VyraTranscript> {
    const [kairoQuery, logosQuery] = await Promise.all([
      this.generateSearchQuery(this.kairoModel, 'Kairo', topic),
      this.generateSearchQuery(this.logosModel, 'Logos', topic)
    ])

    let kairoSources: VectorResult[] = []
    let logosSources: VectorResult[] = []

    if (useVector) {
      try {
        const allResults = await this.vectorClient.queryVector([kairoQuery, logosQuery])
        kairoSources = allResults.filter(
          (item) => (item.rawData as any)?.query === kairoQuery
        )
        logosSources = allResults.filter(
          (item) => (item.rawData as any)?.query === logosQuery
        )
      } catch {
        kairoSources = []
        logosSources = []
      }
    }

    const kairoOpeningLines: string[] = [
      'You are Kairo, a bold debater.',
      `Topic: ${topic}`,
      'Make an opening statement that strongly advocates your position.'
    ]
    if (kairoSources.length > 0) {
      kairoOpeningLines.push(
        'You have access to the following factual snippets.',
        JSON.stringify(kairoSources, null, 2),
        'Use them as evidence and cite their sourceTitle values when you rely on them.'
      )
    }

    const kairoOpeningPrompt = kairoOpeningLines.join('\n\n')
    const kairoOpening = await this.safeGenerate(
      this.kairoModel,
      kairoOpeningPrompt,
      `Based on general knowledge (no current data found), Kairo presents a bold opening position on "${topic}".`
    )

    const logosOpeningLines: string[] = [
      'You are Logos, a careful and skeptical debater.',
      `Topic: ${topic}`,
      'Make an opening statement that emphasizes limitations, uncertainty, and careful reasoning.'
    ]
    if (logosSources.length > 0) {
      logosOpeningLines.push(
        'You have access to the following factual snippets.',
        JSON.stringify(logosSources, null, 2),
        'Use them as evidence and cite their sourceTitle values when you rely on them.'
      )
    }

    const logosOpeningPrompt = logosOpeningLines.join('\n\n')
    const logosOpening = await this.safeGenerate(
      this.logosModel,
      logosOpeningPrompt,
      `Based on general knowledge (no current data found), Logos presents a cautious opening position on "${topic}".`
    )

    const logosRebuttalLines = [
      "You are Logos, replying to Kairo's opening statement in a debate.",
      `Topic: ${topic}`,
      "Kairo's opening statement follows on the next line.",
      kairoOpening,
      'Identify Kairo’s weakest data point or assumption and explain why it is weak.',
      'Use your factual snippets if available and keep a respectful but critical tone.',
      this.formatSourcesLabelled('Your factual snippets', logosSources)
    ]

    const logosRebuttalPrompt = logosRebuttalLines.join('\n\n')
    const logosRebuttal = await this.safeGenerate(
      this.logosModel,
      logosRebuttalPrompt,
      `Based on general knowledge (no current data found), Logos offers a rebuttal highlighting weaknesses in Kairo's position on "${topic}".`
    )

    const kairoRebuttalLines = [
      "You are Kairo, replying to Logos's opening statement in a debate.",
      `Topic: ${topic}`,
      "Logos's opening statement follows on the next line.",
      logosOpening,
      'Defend your position and point out where Logos may be overly cautious or missing key evidence.',
      'Use your factual snippets if available and keep a firm but respectful tone.',
      this.formatSourcesLabelled('Your factual snippets', kairoSources)
    ]

    const kairoRebuttalPrompt = kairoRebuttalLines.join('\n\n')
    const kairoRebuttal = await this.safeGenerate(
      this.kairoModel,
      kairoRebuttalPrompt,
      `Based on general knowledge (no current data found), Kairo offers a rebuttal challenging Logos's cautious stance on "${topic}".`
    )

    const judgeLines: string[] = [
      'You are the Judge, an impartial synthesizer of the debate.',
      `Topic: ${topic}`,
      'Opening from Kairo:',
      kairoOpening,
      'Opening from Logos:',
      logosOpening,
      'Rebuttal from Logos:',
      logosRebuttal,
      'Rebuttal from Kairo:',
      kairoRebuttal,
      'Summarize the strongest points from both sides.',
      'Decide which side is more convincing for this topic and explain why.',
      'If factual snippets are available, weigh arguments that rely on stronger factual grounding more heavily.'
    ]

    if (kairoSources.length > 0 || logosSources.length > 0) {
      judgeLines.push(
        this.formatSourcesLabelled('Factual snippets for Kairo', kairoSources),
        this.formatSourcesLabelled('Factual snippets for Logos', logosSources)
      )
    }

    const judgePrompt = judgeLines.join('\n\n')
    const finalVerdictRaw = await this.safeGenerate(
      this.judgeModel,
      judgePrompt,
      `Based on general knowledge (no current data found), the debate between Kairo and Logos on "${topic}" cannot be fully evaluated because the judging system is temporarily unavailable.`
    )

    const finalVerdict =
      !useVector || (kairoSources.length === 0 && logosSources.length === 0)
        ? `Based on general knowledge (no current data found), ${finalVerdictRaw}`
        : finalVerdictRaw

    const rounds: DebateTurn[] = [
      { speaker: 'Kairo', role: 'opening', content: kairoOpening, citations: kairoSources },
      { speaker: 'Logos', role: 'opening', content: logosOpening, citations: logosSources },
      { speaker: 'Logos', role: 'rebuttal', content: logosRebuttal, citations: logosSources },
      { speaker: 'Kairo', role: 'rebuttal', content: kairoRebuttal, citations: kairoSources },
      { speaker: 'Judge', role: 'synthesis', content: finalVerdict }
    ]

    return {
      topic,
      useVector,
      kairoQuery,
      logosQuery,
      kairoSources,
      logosSources,
      rounds,
      finalVerdict
    }
  }
}
