import {
  AstraEngine,
  MockVectorClient,
  type AstraResponse,
  type LlmClient
} from './app/lib/astra-engine'
import { VyraDebateEngine, type VyraTranscript } from './app/lib/vyra-debate-engine'

class MockLlmClient implements LlmClient {
  async generate(model: string, prompt: string): Promise<string> {
    if (
      prompt.includes('Return a JSON object with fields "intent" and "searchQueries"') &&
      prompt.includes('User prompt:')
    ) {
      return JSON.stringify({
        intent: 'analysis',
        searchQueries: ['mocked search query for: ' + model]
      })
    }

    if (prompt.includes('You are Kairo, a bold debater.')) {
      return `Kairo (${model}) opening statement based on provided topic and sources.`
    }
    if (prompt.includes('You are Logos, a careful and skeptical debater.')) {
      return `Logos (${model}) opening statement emphasizing uncertainty and careful reasoning.`
    }
    if (prompt.includes("You are Logos, replying to Kairo's opening statement in a debate.")) {
      return `Logos (${model}) rebuttal pointing out weaknesses in Kairo's arguments.`
    }
    if (prompt.includes("You are Kairo, replying to Logos's opening statement in a debate.")) {
      return `Kairo (${model}) rebuttal highlighting where Logos is overly cautious.`
    }
    if (prompt.includes('You are the Judge, an impartial synthesizer of the debate.')) {
      return `Judge (${model}) synthesis summarizing both sides and delivering a final verdict.`
    }
    if (prompt.includes('You are Astra, a research assistant.')) {
      return `Astra (${model}) synthesized answer using any provided vectorResults and the user prompt.`
    }
    if (prompt.includes('You are Kairo, a debater preparing for a debate.')) {
      return 'bold renewable energy policy global impact study'
    }
    if (prompt.includes('You are Logos, a debater preparing for a debate.')) {
      return 'empirical evidence on renewable energy subsidy effectiveness'
    }

    return `Model ${model} received a prompt and returned a generic response.`
  }
}

async function runAstraDemo(): Promise<AstraResponse> {
  const llmClient = new MockLlmClient()
  const vectorClient = new MockVectorClient()

  const astra = new AstraEngine({
    classifierModel: 'llama-4-scout',
    primaryModel: 'llama-4-maverick',
    llmClient,
    vectorClient
  })

  const prompt =
    'Explain the main economic and environmental impacts of large-scale renewable energy adoption in Europe.'

  return astra.executeAstraResearch(prompt)
}

async function runVyraDemo(): Promise<VyraTranscript> {
  const llmClient = new MockLlmClient()
  const vectorClient = new MockVectorClient()

  const vyra = new VyraDebateEngine({
    llmClient,
    vectorClient,
    kairoModel: 'kimi-k2-kairo',
    logosModel: 'qwen-32b-logos',
    judgeModel: 'astra-judge'
  })

  const topic = 'Should governments heavily subsidize renewable energy projects?'
  return vyra.executeVyraDebate(topic, true)
}

async function main(): Promise<void> {
  const astraResponse = await runAstraDemo()
  console.log('=== Astra Research Demo ===')
  console.log('Answer:')
  console.log(astraResponse.answer)
  console.log('\nSources:')
  console.log(JSON.stringify(astraResponse.sources, null, 2))

  const vyraTranscript = await runVyraDemo()
  console.log('\n=== Vyra Debate Demo ===')
  console.log('Topic:', vyraTranscript.topic)
  console.log('Kairo query:', vyraTranscript.kairoQuery)
  console.log('Logos query:', vyraTranscript.logosQuery)
  console.log('\nRounds:')
  for (const round of vyraTranscript.rounds) {
    console.log(`\n[${round.speaker} - ${round.role}]`)
    console.log(round.content)
  }
  console.log('\nFinal verdict:')
  console.log(vyraTranscript.finalVerdict)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

