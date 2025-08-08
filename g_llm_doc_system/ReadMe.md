# G LLM Document Processing System

This system uses OpenAI + LangChain to:
- Parse unstructured insurance/legal queries
- Read PDF/DOCX/Email policy documents
- Retrieve relevant clauses using semantic search
- Generate a structured decision (approve/reject, amount, explanation)

## Example Query

> "46M, knee surgery, Pune, 3-month policy"

## Example Output

```json
{
  "decision": "Approved",
  "amount": "₹80,000",
  "justification": "Clause 4.3 allows coverage after 2 months for age < 50",
  "clauses": [ ... ]
}
