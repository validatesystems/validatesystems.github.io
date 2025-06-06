document.addEventListener('DOMContentLoaded', function () {
    // Lista de códigos válidos
    const validCodes = [
        '80841463553-0466',
    ];

    const validationButton = document.querySelector('.input-group button');
    const verificationDiv = document.querySelector('.validation-verification');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const inputCod = document.querySelector('.input-cod');
    const errorMessage = document.querySelector('.error-message');
    const notFoundError = document.querySelector('.not-found-error');

    validationButton.addEventListener('click', function (e) {
        e.preventDefault();

        // Reset de estados
        errorMessage.style.display = 'none';
        notFoundError.style.display = 'none';
        verificationDiv.style.display = 'none';
        inputCod.classList.remove('invalid');

        // Validação do formato
        const codPattern = /^\d{11}-\d{4}$/;
        if (!codPattern.test(inputCod.value)) {
            inputCod.classList.add('invalid');
            errorMessage.style.display = 'block';
            return;
        }

        // Verificação do código
        loadingSpinner.style.display = 'block';

        setTimeout(() => {
            loadingSpinner.style.display = 'none';

            if (validCodes.includes(inputCod.value)) {
                verificationDiv.style.display = 'block';
            } else {
                notFoundError.style.display = 'block';
            }
        }, 1500);
    });
});
