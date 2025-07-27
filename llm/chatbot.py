from openai import OpenAI
from dotenv import load_dotenv
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from file_manager.text_extractor import generate_plaintext

load_dotenv()
client = OpenAI()

model = 'gpt-4.1-mini'

def set_model(m):
    global model
    model = m

def ask(prompt):
    response = client.responses.create(
        model=model,
        input=prompt
    )
    return response.output_text

def generate_quiz_prompt(content, specifications):
    return ask(f"""
You are a world-class educational AI that specializes in generating challenging, accurate, and pedagogically-sound quizzes.

You will receive content such as lecture notes, textbook excerpts, study materials, or educational text. Your task is to:

1. Carefully analyze the content to understand key concepts, facts, and relationships.
2. Generate a quiz consisting of {specifications['questions']} questions (no more, no less). The question types should be {specifications['question_types']} that test understanding, not just memory. You need to have at least one of each of the question types provided.
3. Your questions will be in the form of a json list and the questions will be as such:

For every question:
{{
    "text": &lt;question, and for fill-in-blank, use only three underscores to denote each blank to be filled&gt;,
    "type": &lt;"multiple-choice" or "true-false" or "short-answer" or "fill-in-blank", depending on the question type&gt;,
    "options": {{
        "A": "&lt;option 1&gt;",
        "B": "&lt;option 2&gt;",
        "C": "&lt;option 3&gt;",
        "D": "&lt;option 4&gt;"
    }} for mcq questions, null for everything else,
    "correct_answer": &lt;index of current answer from 0-3 for mcq, 0=True 1=False for true-false, ideal answer for short answer, and an array with the right answers for fill in the blanks&gt;
    "explanation": &lt;good and brief explanation to really help the student understand&gt;
}}
Your response must be a list like this: {{"questions": [...]}} filled with the questions in the format specified above. Do not include any other things except the pure json itself (no markers such as ```json either)

**Instructions:**
- Avoid yes/no or true/false questions.
- Focus on critical thinking and application-based questions where possible.
- Use clear, academic language but keep it student-friendly.
- Do not ask questions unrelated to the input content.
- The quiz difficulty must be {specifications['difficulty']}

Now generate the quiz based on the following content:

\"\"\"
{content}
\"\"\"
""")


def generate_answer_validation_prompt(
        file_content: str,
        questions: List[Dict],
        student_answers: List[Dict],
        specifications: Optional[Dict] = None
) -> str:
    """
    Generate a comprehensive answer validation using LLM

    Args:
        file_content: Extracted text from course materials
        questions: List of questions with expected answers
        student_answers: List of student responses to validate
        specifications: Additional validation parameters

    Returns:
        JSON string with validation results
    """

    # Prepare context about each question type for the LLM
    question_type_guidance = {
        'multiple-choice': "For multiple choice, verify the selected option index matches the correct answer based on course materials.",
        'true-false': "For true/false, determine if the statement is factually correct according to the course materials.",
        'short-answer': "For short answers, check if the student demonstrates understanding of the concept, even with different wording. Award partial credit for partially correct responses.",
        'fill-in-blank': "For fill-in-the-blank, validate each blank based on the context and course materials. Consider synonyms and equivalent terms."
    }

    # Create detailed question context
    questions_context = []
    for q in questions:
        q_context = {
            "id": q['id'],
            "type": q['type'],
            "text": q['text'],
            "validation_guidance": question_type_guidance.get(q['type'], "Validate based on course materials.")
        }

        if q['type'] == 'multiple-choice' and q.get('options'):
            q_context['options'] = q['options']
            q_context['correct_option_index'] = q.get('correct_answer', 0)

        elif q['type'] == 'true-false':
            q_context['correct_answer'] = "True" if q.get('correct_answer', 0) == 0 else "False"

        questions_context.append(q_context)

    # Create the validation prompt
    prompt = f"""
You are an expert educational assessment AI with advanced understanding of pedagogy and fair grading practices. Your task is to validate student quiz answers against authoritative course materials.

## COURSE MATERIALS CONTEXT:
{file_content[:12000]}  # Limit to prevent token overflow

## ASSESSMENT GUIDELINES:
1. **Accuracy**: Base all validations strictly on the provided course materials
2. **Fairness**: Give credit for correct understanding expressed differently  
3. **Partial Credit**: Award proportional scores for partially correct responses
4. **Consistency**: Apply the same standards across all questions
5. **Constructive Feedback**: Provide specific, helpful explanations

## QUESTIONS TO VALIDATE:
{json.dumps(questions_context, indent=2)}

## STUDENT RESPONSES:
{json.dumps(student_answers, indent=2)}

## VALIDATION INSTRUCTIONS:

### For Multiple Choice & True/False:
- Verify correctness against course materials
- Score: 100% if correct, 0% if incorrect
- Provide brief explanation referencing source material

### For Short Answer Questions:
- Look for key concepts and understanding, not exact wording
- Award partial credit: 100% (complete), 75% (mostly correct), 50% (partially correct), 25% (minimal understanding), 0% (incorrect/irrelevant)
- Consider synonyms, paraphrasing, and different valid explanations
- Explain what was missing for partial credit responses

### For Fill-in-the-Blank:
- Validate each blank individually
- Accept synonyms and equivalent terms
- Score proportionally based on correct blanks
- Consider context and technical accuracy

## REQUIRED OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure:

```json
{{
    "validation_results": [
        {{
            "question_id": 1,
            "question_type": "multiple-choice",
            "student_answer": "Option B or full text of answer",
            "expected_answer": "Correct option or expected response",
            "is_correct": true,
            "score_percentage": 100,
            "feedback": "Specific explanation of why this answer is correct/incorrect, referencing course materials",
            "partial_credit_details": "Explanation if partial credit awarded, what was correct/missing",
            "key_concepts_identified": ["concept1", "concept2"],
            "improvement_suggestions": "Specific advice for better answers"
        }}
    ],
    "overall_score": 87.5,
    "total_questions": 10,
    "correct_answers": 8.75,
    "grading_summary": "Brief summary of overall performance and patterns",
    "validation_confidence": "high/medium/low based on clarity of course materials"
}}
```

CRITICAL: Respond with ONLY the JSON object. No additional text, explanations, or formatting.
"""

    return prompt


def validate_quiz_answers_with_llm(
        file_content: str,
        questions: List[Dict],
        student_answers: List[Dict],
) -> Dict[str, Any]:
    """
    Main function to validate answers using LLM

    Returns structured validation results
    """
    try:
        # Generate the validation prompt
        validation_prompt = generate_answer_validation_prompt(
            file_content, questions, student_answers
        )

        # Get LLM response (replace with your actual LLM call)
        llm_response = ask(validation_prompt)

        # Parse and validate the response
        validation_results = parse_and_validate_response(llm_response)

        return validation_results

    except Exception as e:
        print(f"LLM validation error: {e}")
        return {
            "validation_results": [],
            "overall_score": 0,
            "total_questions": len(questions),
            "correct_answers": 0,
            "grading_summary": f"Validation failed: {str(e)}",
            "validation_confidence": "low",
            "error": True
        }


def parse_and_validate_response(llm_response: str) -> Dict[str, Any]:
    """
    Parse LLM response and validate the JSON structure
    """
    try:
        # Extract JSON from response (handle cases where LLM adds extra text)
        json_match = re.search(r'\{.*\}', llm_response, re.DOTALL)
        if not json_match:
            raise ValueError("No JSON found in LLM response")

        json_str = json_match.group(0)
        validation_data = json.loads(json_str)

        # Validate required fields
        required_fields = ['validation_results', 'overall_score', 'total_questions', 'correct_answers']
        for field in required_fields:
            if field not in validation_data:
                raise ValueError(f"Missing required field: {field}")

        # Validate each validation result
        for result in validation_data['validation_results']:
            required_result_fields = ['question_id', 'question_type', 'is_correct', 'score_percentage', 'feedback']
            for field in required_result_fields:
                if field not in result:
                    result[field] = get_default_value(field)

        return validation_data

    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        return create_error_response("Invalid JSON in LLM response")
    except Exception as e:
        print(f"Validation parsing error: {e}")
        return create_error_response(str(e))


def get_default_value(field: str) -> Any:
    """Get default values for missing fields"""
    defaults = {
        'question_id': 0,
        'question_type': 'unknown',
        'student_answer': '',
        'expected_answer': '',
        'is_correct': False,
        'score_percentage': 0,
        'feedback': 'Unable to validate this answer',
        'partial_credit_details': '',
        'key_concepts_identified': [],
        'improvement_suggestions': ''
    }
    return defaults.get(field, '')


def create_error_response(error_message: str) -> Dict[str, Any]:
    """Create a standardized error response"""
    return {
        "validation_results": [],
        "overall_score": 0,
        "total_questions": 0,
        "correct_answers": 0,
        "grading_summary": f"Validation error: {error_message}",
        "validation_confidence": "low",
        "error": True,
        "error_message": error_message
    }


# Additional utility functions for enhanced validation

def calculate_semantic_similarity(answer1: str, answer2: str) -> float:
    """
    Calculate semantic similarity between two answers
    This is a placeholder - you might want to use sentence transformers or similar
    """
    # Simple word overlap similarity (replace with proper semantic similarity)
    words1 = set(answer1.lower().split())
    words2 = set(answer2.lower().split())

    if not words1 or not words2:
        return 0.0

    intersection = words1.intersection(words2)
    union = words1.union(words2)

    return len(intersection) / len(union) if union else 0.0


def extract_key_concepts(text: str, course_materials: str) -> List[str]:
    """
    Extract key concepts from student answer that appear in course materials
    """
    # This is a simplified version - you might want to use NLP techniques
    text_words = set(text.lower().split())
    material_words = set(course_materials.lower().split())

    # Find important words (longer than 3 characters that appear in both)
    key_concepts = []
    for word in text_words:
        if len(word) > 3 and word in material_words:
            key_concepts.append(word)

    return key_concepts[:5]  # Return top 5 concepts

class AnswerValidator:
    """
    LLM-based answer validation system that can handle:
    - Multiple choice (verification)
    - True/False (verification)
    - Short answer (semantic matching)
    - Fill-in-the-blank (contextual validation)
    """

    def __init__(self):
        self.validation_prompt_template = """
You are an expert educator and grader. Your task is to validate student answers against quiz questions based on the provided course materials. You will be chatting directly to the student, so comments must speak directly to the student using 2nd pronouns.

## COURSE MATERIALS:
{file_content}

## QUIZ QUESTIONS WITH EXPECTED ANSWERS:
{questions_json}

## STUDENT ANSWERS TO VALIDATE:
{student_answers_json}

## INSTRUCTIONS:
1. For each student answer, determine if it's correct based on the course materials
2. For multiple-choice and true/false: verify the selected option is correct
3. For short-answer questions: check if the student's response demonstrates understanding of the concept, even if wording differs
4. For fill-in-the-blank: validate each blank based on context from the materials
5. Provide detailed feedback explaining why each answer is correct or incorrect
6. Give partial credit for partially correct answers (0-100% per question)
7. Ensure that the score is calculated accurately based on the individual grade for each question

## OUTPUT FORMAT:
Return a JSON object with this exact structure:
```json
{
    "validation_results": [
        {
            "question_id": 1,
            "question_type": "multiple-choice",
            "student_answer": "Selected option or text",
            "expected_answer": "Correct option or expected text",
            "is_correct": true/false,
            "score_percentage": 85,
            "feedback": "Detailed explanation of why this answer is correct/incorrect",
            "partial_credit_details": "Explanation if partial credit given"
        }
    ],
    "overall_score": 87.5,
    "total_questions": 10,
    "correct_answers": 8,
    "summary": "Overall performance summary"
}
```

Validate the answers now:
"""

    def validate_quiz_answers(
            self,
            project_files: List[Dict],
            questions: List[Dict],
            student_answers: List[Dict]
    ) -> Dict[str, Any]:
        """
        Main validation function that processes all answers using LLM

        Args:
            project_files: List of file objects with file_path
            questions: List of question objects with expected answers
            student_answers: List of student answer objects

        Returns:
            Dictionary with validation results
        """
        try:
            # Extract text content from project files
            file_paths = [file['file_path'] for file in project_files]
            file_content = generate_plaintext(file_paths)

            # Format questions with expected answers
            questions_for_validation = self._format_questions_for_validation(questions)

            # Format student answers
            student_answers_formatted = self._format_student_answers(student_answers)

            validation_results = validate_quiz_answers_with_llm(
                file_content=file_content,
                questions=questions_for_validation,
                student_answers=student_answers_formatted
            )

            # Add additional processing if needed
            validation_results = self._enhance_validation_results(validation_results, questions, student_answers)

            return validation_results

        except Exception as e:
            print(f"Error in answer validation: {e}")
            # Fallback to basic validation
            return self._fallback_validation(questions, student_answers)

    def _enhance_validation_results(self, validation_results: Dict, questions: List[Dict],
                                    student_answers: List[Dict]) -> Dict:
        """Add any additional processing to validation results"""
        try:
            # Add timestamp
            validation_results['validated_at'] = datetime.now().isoformat()

            # Add question types summary
            question_types = {}
            for question in questions:
                q_type = question.get('type', 'unknown')
                question_types[q_type] = question_types.get(q_type, 0) + 1

            validation_results['question_types_summary'] = question_types

            # Add performance metrics
            if validation_results.get('validation_results'):
                scores = [result.get('score_percentage', 0) for result in validation_results['validation_results']]
                validation_results['performance_metrics'] = {
                    'average_score': sum(scores) / len(scores) if scores else 0,
                    'highest_score': max(scores) if scores else 0,
                    'lowest_score': min(scores) if scores else 0,
                    'questions_with_partial_credit': sum(1 for score in scores if 0 < score < 100)
                }

            return validation_results

        except Exception as e:
            print(f"Error enhancing validation results: {e}")
            return validation_results

    def _format_questions_for_validation(self, questions: List[Dict]) -> List[Dict]:
        """Format questions with expected answers for LLM validation"""
        formatted_questions = []

        for question in questions:
            formatted_q = {
                "id": question['id'],
                "type": question['type'],
                "text": question['text'],
                "expected_answer": None,
                "options": question.get('options', None)
            }

            # Add expected answer based on question type
            # Add expected answer based on question type
            if question['type'] == 'multiple-choice':
                correct_index = question.get('correct_answer', 0)
                # Ensure correct_index is an integer
                if isinstance(correct_index, str) and correct_index.isdigit():
                    correct_index = int(correct_index)
                elif not isinstance(correct_index, int):
                    correct_index = 0

                if question.get('options') and isinstance(question['options'], dict):
                    options_list = list(question['options'].values())
                    if correct_index < len(options_list):
                        formatted_q['expected_answer'] = {
                            "index": correct_index,
                            "text": options_list[correct_index]
                        }


            elif question['type'] == 'true-false':
                correct_answer = question.get('correct_answer', 0)
                # Ensure correct_answer is an integer
                if isinstance(correct_answer, str) and correct_answer.isdigit():
                    correct_answer = int(correct_answer)
                elif not isinstance(correct_answer, int):
                    correct_answer = 0
                formatted_q['expected_answer'] = {
                    "index": correct_answer,
                    "text": "True" if correct_answer == 0 else "False"
                }

            elif question['type'] in ['short-answer', 'fill-in-blank']:
                # For these types, we rely on the LLM to determine correctness from context
                formatted_q['expected_answer'] = question.get('expected_answer',
                                                              "To be determined from course materials")

            formatted_questions.append(formatted_q)

        return formatted_questions

    def _format_student_answers(self, student_answers: List[Dict]) -> List[Dict]:
        """Format student answers for LLM validation"""
        formatted_answers = []

        for answer in student_answers:
            formatted_answer = {
                "question_id": answer['question_id'],
                "selected_option": answer.get('selected_option'),
                "answer_text": answer.get('answer_text', ''),
                "fill_in_answers": answer.get('fill_in_answers', [])
            }
            formatted_answers.append(formatted_answer)

        return formatted_answers

    def _parse_validation_response(self, llm_response: str) -> Dict[str, Any]:
        """Parse and validate the LLM response"""
        try:
            # Try to extract JSON from the response
            start_idx = llm_response.find('{')
            end_idx = llm_response.rfind('}') + 1

            if start_idx != -1 and end_idx != -1:
                json_str = llm_response[start_idx:end_idx]
                validation_results = json.loads(json_str)

                # Validate the structure
                if 'validation_results' in validation_results:
                    return validation_results
                else:
                    raise ValueError("Invalid response structure")
            else:
                raise ValueError("No JSON found in response")

        except Exception as e:
            print(f"Error parsing LLM validation response: {e}")
            # Return error structure
            return {
                "validation_results": [],
                "overall_score": 0,
                "total_questions": 0,
                "correct_answers": 0,
                "summary": f"Validation error: {str(e)}",
                "error": True
            }

    def _fallback_validation(self, questions: List[Dict], student_answers: List[Dict]) -> Dict[str, Any]:
        """Fallback validation using simple matching when LLM fails"""
        validation_results = []
        correct_count = 0

        for answer in student_answers:
            question = next((q for q in questions if q['id'] == answer['question_id']), None)
            if not question:
                continue

            is_correct = False
            score_percentage = 0
            feedback = "Fallback validation used"

            # Simple validation logic
            if question['type'] in ['multiple-choice', 'true-false']:
                expected = question.get('correct_answer', 0)
                student_selection = answer.get('selected_option')
                is_correct = (student_selection == expected)
                score_percentage = 100 if is_correct else 0

            elif question['type'] == 'short-answer':
                # For short answers, give partial credit if any text provided
                student_text = answer.get('answer_text', '').strip()
                if student_text:
                    score_percentage = 50  # Partial credit
                    feedback = "Partial credit given - answer requires manual review"

            elif question['type'] == 'fill-in-blank':
                # Basic validation for fill-in-the-blank
                fill_answers = answer.get('fill_in_answers', [])
                if fill_answers and any(ans.strip() for ans in fill_answers):
                    score_percentage = 50  # Partial credit
                    feedback = "Partial credit given - answer requires manual review"

            if is_correct or score_percentage > 0:
                correct_count += (score_percentage / 100)

            validation_results.append({
                "question_id": answer['question_id'],
                "question_type": question['type'],
                "student_answer": answer.get('selected_option') or answer.get('answer_text') or answer.get(
                    'fill_in_answers'),
                "expected_answer": question.get('correct_answer'),
                "is_correct": is_correct,
                "score_percentage": score_percentage,
                "feedback": feedback,
                "partial_credit_details": "Fallback validation applied"
            })

        total_questions = len(validation_results)
        overall_score = (correct_count / total_questions * 100) if total_questions > 0 else 0

        return {
            "validation_results": validation_results,
            "overall_score": round(overall_score, 1),
            "total_questions": total_questions,
            "correct_answers": int(correct_count),
            "summary": f"Fallback validation completed. Score: {overall_score:.1f}%"
        }