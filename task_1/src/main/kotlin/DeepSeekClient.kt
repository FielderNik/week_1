package com.appapp

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.isSuccess
import io.ktor.http.contentType

private const val DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
private const val DEFAULT_MODEL = "deepseek-chat"

class DeepSeekClient(
    private val httpClient: HttpClient,
    private val apiKey: String,
) {
    suspend fun ask(prompt: String): String {
        val httpResponse = httpClient.post(DEEPSEEK_API_URL) {
            bearerAuth(apiKey)
            contentType(ContentType.Application.Json)
            setBody(
                ChatCompletionRequest(
                    model = DEFAULT_MODEL,
                    messages = listOf(
                        ChatMessage(
                            role = "system",
                            content = "Отвечай на русском языке."
                        ),
                        ChatMessage(role = "user", content = prompt)
                    )
                )
            )
        }

        val responseText = httpResponse.bodyAsText()
        if (!httpResponse.status.isSuccess()) {
            error("DeepSeek API error ${httpResponse.status.value}: $responseText")
        }

        val response = AppJson.decodeFromString<ChatCompletionResponse>(responseText)

        return response.choices.firstOrNull()?.message?.content?.trim()
            ?: error("DeepSeek returned an empty response: $responseText")
    }
}
