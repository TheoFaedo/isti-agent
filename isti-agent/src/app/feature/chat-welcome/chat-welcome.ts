import { Component, output } from '@angular/core';
@Component({ selector: 'app-chat-welcome', styleUrl: './chat-welcome.less', templateUrl: './chat-welcome.html' })
export class ChatWelcomeComponent { readonly suggestionSelected = output<string>(); }
