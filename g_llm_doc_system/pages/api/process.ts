import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { simpleParser } from 'mailparser';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const query = formData.get('query') as string;
  const files = formData.getAll('documents') as File[];

  const structuredQuery = await parseQuery(query);
  const parsedDocs = await parseDocuments(files);
  const relevantClauses = await getRelevantClauses(parsedDocs, structuredQuery);
  const result = await generateDecision(structuredQuery, relevantClauses);

  return NextResponse.json(result);
}

async function parseQuery(query: string) {
  const prompt = `Extract: Age, Gender, Procedure, Location, Policy Duration from: "${query}". Respond as JSON.`;
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return JSON.parse(response.choices[0].message.content);
}

async function parseDocuments(files: File[]) {
  const results: { name: string; content: string }[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name;

    if (name.endsWith('.pdf')) {
      const data = await pdf(buffer);
      results.push({ name, content: data.text });
    } else if (name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      results.push({ name, content: value });
    } else if (name.endsWith('.eml')) {
      const parsed = await simpleParser(buffer);
      results.push({ name, content: parsed.text || '' });
    }
  }
  return results;
}

async function getRelevantClauses(documents, structuredQuery) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 512 });
  let docs = [];
  for (const doc of documents) {
    const chunks = await splitter.createDocuments([doc.content]);
    for (const chunk of chunks) {
      chunk.metadata = { source: doc.name };
      docs.push(chunk);
    }
  }
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());
  const searchQuery = `${structuredQuery.procedure} ${structuredQuery.location}`;
  const results = await vectorStore.similaritySearch(searchQuery, 5);
  return results;
}

async function generateDecision(queryInfo, clauses) {
  const prompt = `
You are a policy decision engine. Given these clauses:
${clauses.map((c, i) => `Clause ${i + 1}: ${c.pageContent}`).join('\n')}

Evaluate the following case:
Age: ${queryInfo.age}, Gender: ${queryInfo.gender}, Procedure: ${queryInfo.procedure}, Location: ${queryInfo.location}, Policy Duration: ${queryInfo.policyDuration}

Respond in JSON with: decision, amount, justification, clauses (list of matched clauses).
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return JSON.parse(response.choices[0].message.content);
}
