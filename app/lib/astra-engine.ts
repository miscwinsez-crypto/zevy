export interface VectorResult {
  sourceTitle: string
  snippet: string
  rawData: unknown
  retrievedAt: string
}

export interface AstraResponse {
  answer: string
  sources: VectorResult[]
}

export type AstraIntent = 'chat' | 'fact' | 'analysis'

export interface AstraClassification {
  intent: AstraIntent
  searchQueries: string[]
}

export interface VectorClient {
  queryVector(queries: string[]): Promise<VectorResult[]>
}

export interface LlmClient {
  generate(model: string, prompt: string): Promise<string>
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in text')
  }
  return text.slice(start, end + 1)
}

function inferIntentFromPrompt(prompt: string): AstraIntent {
  const normalized = prompt.toLowerCase()
  if (normalized.length > 200) {
    return 'analysis'
  }
  if (/\b(who|what|where|when|why|how)\b/.test(normalized) || /\?$/.test(normalized)) {
    return 'fact'
  }
  return 'chat'
}

export class AstraEngine {
  private readonly classifierModel: string
  private readonly primaryModel: string
  private readonly llmClient: LlmClient
  private readonly vectorClient: VectorClient

  constructor(options: {
    classifierModel: string
    primaryModel: string
    llmClient: LlmClient
    vectorClient: VectorClient
  }) {
    this.classifierModel = options.classifierModel
    this.primaryModel = options.primaryModel
    this.llmClient = options.llmClient
    this.vectorClient = options.vectorClient
  }

  private async classifyPrompt(prompt: string): Promise<AstraClassification> {
    const instructionLines = [
      'You are a fast routing model that classifies user prompts.',
      'Decide if the user intent is casual chat, factual lookup, or deeper analysis.',
      'Return a JSON object with fields "intent" and "searchQueries".',
      'Allowed intent values: "chat", "fact", "analysis".',
      'searchQueries must be an array of strings. Use an empty array if no external search is needed.',
      'User prompt follows on the next line.'
    ]

    const classifierPrompt = `${instructionLines.join('\n')}\n\nUser prompt:\n${prompt}`

    let raw: string
    try {
      raw = await this.llmClient.generate(this.classifierModel, classifierPrompt)
    } catch {
      const intent = inferIntentFromPrompt(prompt)
      const searchQueries = intent === 'chat' ? [] : [prompt]
      return { intent, searchQueries }
    }

    try {
      const jsonText = extractJsonObject(raw)
      const parsed = JSON.parse(jsonText) as Partial<AstraClassification>
      const intent: AstraIntent =
        parsed.intent === 'fact' || parsed.intent === 'analysis' || parsed.intent === 'chat'
          ? parsed.intent
          : inferIntentFromPrompt(prompt)

      const searchQueries = Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        : intent === 'chat'
          ? []
          : [prompt]

      return { intent, searchQueries }
    } catch {
      const intent = inferIntentFromPrompt(prompt)
      const searchQueries = intent === 'chat' ? [] : [prompt]
      return { intent, searchQueries }
    }
  }

  async executeAstraResearch(prompt: string): Promise<AstraResponse> {
    const classification = await this.classifyPrompt(prompt)

    let vectorResults: VectorResult[] = []
    if (classification.searchQueries.length > 0) {
      try {
        vectorResults = await this.vectorClient.queryVector(classification.searchQueries)
      } catch {
        vectorResults = []
      }
    }

    const vectorBlock =
      vectorResults.length > 0 ? JSON.stringify(vectorResults, null, 2) : '[]'

    const synthesisLines = [
      'You are Astra, a research assistant.',
      'You receive the user prompt and an optional array of vector search results.',
      'Treat vector search results as your factual grounding when they are present.',
      'If vectorResults is not empty, prefer its contents over your own prior knowledge for concrete facts.',
      'If vectorResults is empty, you must begin your answer with the exact phrase: "Based on general knowledge (no current data found)...", and then answer based on your own reasoning while clearly indicating uncertainty when appropriate.',
      'Always cite sources explicitly using their sourceTitle values when you rely on them.',
      `Current intent: ${classification.intent}`,
      `vectorResults: ${vectorBlock}`,
      `User prompt: ${prompt}`
    ]

    const synthesisPrompt = synthesisLines.join('\n\n')
    let answer: string
    try {
      answer = await this.llmClient.generate(this.primaryModel, synthesisPrompt)
    } catch {
      if (vectorResults.length === 0) {
        answer =
          'Based on general knowledge (no current data found), the research system is temporarily unavailable. Please try again in a moment or rephrase your question.'
      } else {
        answer =
          'Based on the retrieved data, the research system is temporarily unavailable to synthesize a full answer. Feature temporarily unavailable; please try again soon.'
      }
    }

    return {
      answer,
      sources: vectorResults
    }
  }
}

export class MockVectorClient implements VectorClient {
  async queryVector(queries: string[]): Promise<VectorResult[]> {
    const now = new Date().toISOString()
    const results: VectorResult[] = []

    for (const query of queries) {
      results.push({
        sourceTitle: `Mock source for "${query}"`,
        snippet: `This is a mocked snippet for the query "${query}".`,
        rawData: { query },
        retrievedAt: now
      })
    }

    return results
  }
}
