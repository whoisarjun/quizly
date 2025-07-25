// Form switching
function switchToSignUp() {
    document.getElementById('signInForm').classList.add('hidden');
    document.getElementById('signUpForm').classList.remove('hidden');
    document.title = 'Quizly - Create Account';
    // Reset validation when switching
    validateSignUpForm();
}

function switchToSignIn() {
    document.getElementById('signUpForm').classList.add('hidden');
    document.getElementById('signInForm').classList.remove('hidden');
    document.title = 'Quizly - Sign In';
    // Reset validation when switching
    validateSignInForm();
}

// Password toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.password-toggle i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Password strength checker
document.getElementById('signUpPassword').addEventListener('input', function() {
    const password = this.value;
    const strengthBar = document.querySelector('.strength-fill');
    const strengthText = document.querySelector('.strength-text');

    let strength = 0;
    let text = 'Weak';

    if (password.length >= 8) strength += 1;
    if (password.match(/[a-z]/)) strength += 1;
    if (password.match(/[A-Z]/)) strength += 1;
    if (password.match(/[0-9]/)) strength += 1;
    if (password.match(/[^a-zA-Z0-9]/)) strength += 1;

    const percentage = (strength / 5) * 100;
    strengthBar.style.width = percentage + '%';

    if (strength <= 2) {
        text = 'Weak';
        strengthBar.style.background = 'var(--danger)';
    } else if (strength <= 3) {
        text = 'Fair';
        strengthBar.style.background = 'var(--warning)';
    } else if (strength <= 4) {
        text = 'Good';
        strengthBar.style.background = 'var(--accent)';
    } else {
        text = 'Strong';
        strengthBar.style.background = 'var(--success)';
    }

    strengthText.textContent = text;
});

// Get form elements
const signInForm = document.getElementById('signInFormElement');
const signUpForm = document.getElementById('signUpFormElement');

// Sign In Form Validation
function validateSignInForm() {
    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value.trim();
    const submitBtn = signInForm.querySelector('.auth-btn');

    const isValid = email && password;

    submitBtn.disabled = !isValid;
    submitBtn.style.opacity = isValid ? '1' : '0.6';
    submitBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';

    return isValid;
}

// Sign Up Form Validation
function validateSignUpForm() {
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('signUpEmail').value.trim();
    const password = document.getElementById('signUpPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const agreeTerms = document.getElementById('agreeTerms').checked;
    const submitBtn = signUpForm.querySelector('.auth-btn');

    // Check if passwords match
    const passwordsMatch = password && confirmPassword && password === confirmPassword;

    // Show/hide password mismatch error
    const errorElement = document.getElementById('confirmPasswordError');
    if (confirmPassword && !passwordsMatch) {
        errorElement.style.display = 'block';
    } else {
        errorElement.style.display = 'none';
    }

    // Check if all fields are filled and valid
    const isValid = firstName && lastName && email && password && confirmPassword && passwordsMatch && agreeTerms;

    submitBtn.disabled = !isValid;
    submitBtn.style.opacity = isValid ? '1' : '0.6';
    submitBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';

    return isValid;
}

// Add event listeners for Sign In form
document.getElementById('signInEmail').addEventListener('input', validateSignInForm);
document.getElementById('signInPassword').addEventListener('input', validateSignInForm);

// Add event listeners for Sign Up form
document.getElementById('firstName').addEventListener('input', validateSignUpForm);
document.getElementById('lastName').addEventListener('input', validateSignUpForm);
document.getElementById('signUpEmail').addEventListener('input', validateSignUpForm);
document.getElementById('signUpPassword').addEventListener('input', validateSignUpForm);
document.getElementById('confirmPassword').addEventListener('input', validateSignUpForm);
document.getElementById('agreeTerms').addEventListener('change', validateSignUpForm);

// Sign In Form Submission
signInForm.addEventListener('submit', function(e) {
    e.preventDefault();

    if (!validateSignInForm()) {
        alert('Please fill in all fields.');
        return;
    }

    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value.trim();

    fetch('/sign_in', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Sign in response:', data);
        // Handle success/error accordingly
    })
    .catch(error => {
        console.error('Sign in error:', error);
    });
});

// Sign Up Form Submission
signUpForm.addEventListener('submit', function(e) {
    e.preventDefault();

    if (!validateSignUpForm()) {
        alert('Please fill in all fields correctly.');
        return;
    }

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('signUpEmail').value.trim();
    const password = document.getElementById('signUpPassword').value.trim();

    fetch('/create_user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: email,
            password: password
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Server response:', data);
        // Optional: redirect or show success message
    })
    .catch(error => {
        console.error('Error during sign up:', error);
    });
});

// Initialize validation on page load
document.addEventListener('DOMContentLoaded', function() {
    validateSignInForm();
    validateSignUpForm();
});